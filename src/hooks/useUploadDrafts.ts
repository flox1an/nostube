import { useState, useEffect, useCallback, useMemo } from 'react'
import type { UploadDraft, UploadDraftsData } from '@/types/upload-draft'
import { removeOldDrafts } from '@/lib/upload-draft-utils'
import { useCurrentUser } from './useCurrentUser'
import { useNostrPublish } from './useNostrPublish'
import { useAppContext } from './useAppContext'
import { nowInSecs } from '@/lib/utils'
import { createAddressLoader } from 'applesauce-loaders/loaders'

const STORAGE_KEY = 'nostube_upload_drafts'
const MAX_DRAFTS = 10

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs
  )
}

export function useUploadDrafts() {
  const [drafts, setDrafts] = useState<UploadDraft[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed: UploadDraftsData = JSON.parse(stored)
        const cleaned = removeOldDrafts(parsed.drafts, 30)

        // Save cleaned version if we removed any
        if (cleaned.length !== parsed.drafts.length) {
          const data: UploadDraftsData = {
            version: '1',
            lastModified: Date.now(),
            drafts: cleaned,
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        }

        return cleaned
      } catch (error) {
        console.error('Failed to load drafts from localStorage:', error)
      }
    }
    return []
  })
  const [currentDraft, setCurrentDraft] = useState<UploadDraft | null>(null)

  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const { config, pool } = useAppContext()

  const saveToLocalStorage = useCallback((draftsToSave: UploadDraft[]) => {
    const data: UploadDraftsData = {
      version: '1',
      lastModified: Date.now(),
      drafts: draftsToSave,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [])

  const createDraft = useCallback((): UploadDraft => {
    const newDraft: UploadDraft = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }

    setDrafts(prev => {
      if (prev.length >= MAX_DRAFTS) {
        throw new Error('Maximum 10 drafts allowed')
      }

      const updated = [...prev, newDraft]
      saveToLocalStorage(updated)
      return updated
    })

    return newDraft
  }, [saveToLocalStorage])

  const saveToNostr = useCallback(
    async (draftsToSave: UploadDraft[]) => {
      if (!user) return

      try {
        const event = {
          kind: 30078,
          content: JSON.stringify({
            version: '1',
            lastModified: Date.now(),
            drafts: draftsToSave,
          }),
          created_at: nowInSecs(),
          tags: [['d', 'nostube-uploads']],
        }

        const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

        await publish({ event, relays: writeRelays })
      } catch (error) {
        console.error('Failed to sync to Nostr:', error)
        // Silent failure - localStorage has the data
      }
    },
    [user, publish, config.relays]
  )

  const saveDraftsImmediate = useCallback(
    (draftsToSave: UploadDraft[]) => {
      saveToLocalStorage(draftsToSave)
      saveToNostr(draftsToSave)
    },
    [saveToLocalStorage, saveToNostr]
  )

  const debouncedSaveDrafts = useMemo(
    () =>
      debounce((draftsToSave: UploadDraft[]) => {
        saveToLocalStorage(draftsToSave)
        saveToNostr(draftsToSave)
      }, 3000),
    [saveToLocalStorage, saveToNostr]
  )

  const updateDraft = useCallback(
    (draftId: string, updates: Partial<UploadDraft>) => {
      setDrafts(prev => {
        const updated = prev.map(d =>
          d.id === draftId ? { ...d, ...updates, updatedAt: Date.now() } : d
        )

        // Immediate save for milestones, debounced for form fields
        if (isMilestoneUpdate(updates)) {
          saveDraftsImmediate(updated)
        } else {
          debouncedSaveDrafts(updated)
        }

        return updated
      })
    },
    [saveDraftsImmediate, debouncedSaveDrafts]
  )

  const deleteDraft = useCallback(
    (draftId: string) => {
      setDrafts(prev => {
        const updated = prev.filter(d => d.id !== draftId)
        saveToLocalStorage(updated)
        return updated
      })
    },
    [saveToLocalStorage]
  )

  const mergeDraftsFromNostr = useCallback(
    (nostrDrafts: UploadDraft[]) => {
      setDrafts(prevLocal => {
        const draftMap = new Map<string, UploadDraft>()

        // Add local drafts first
        prevLocal.forEach(d => draftMap.set(d.id, d))

        // Nostr drafts win on conflict (newer updatedAt)
        nostrDrafts.forEach(d => {
          const existing = draftMap.get(d.id)
          if (!existing || d.updatedAt > existing.updatedAt) {
            draftMap.set(d.id, d)
          }
        })

        // Sort by updatedAt descending
        const merged = Array.from(draftMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)

        // Save merged result to localStorage
        saveToLocalStorage(merged)

        return merged
      })
    },
    [saveToLocalStorage]
  )

  // Subscribe to NIP-78 event changes
  useEffect(() => {
    if (!user?.pubkey) return

    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

    const loader = createAddressLoader(pool)
    const sub = loader({
      kind: 30078,
      pubkey: user.pubkey,
      identifier: 'nostube-uploads',
      relays: readRelays,
    }).subscribe(event => {
      if (event) {
        try {
          const parsed = JSON.parse(event.content)
          const nostrDrafts = parsed.drafts || []
          mergeDraftsFromNostr(nostrDrafts)
        } catch (error) {
          console.error('Failed to parse NIP-78 event:', error)
        }
      }
    })

    return () => sub.unsubscribe()
  }, [user?.pubkey, pool, config.relays, mergeDraftsFromNostr])

  return {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    updateDraft,
    deleteDraft,
    isLoading: false,
  }
}

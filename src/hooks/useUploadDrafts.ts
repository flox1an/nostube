import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { UploadDraft, UploadDraftsData } from '@/types/upload-draft'
import { removeOldDrafts } from '@/lib/upload-draft-utils'
import { useCurrentUser } from './useCurrentUser'
import { useNostrPublish } from './useNostrPublish'
import { useAppContext } from './useAppContext'
import { nowInSecs } from '@/lib/utils'
import { createAddressLoader } from 'applesauce-loaders/loaders'

const STORAGE_KEY = 'nostube_upload_drafts'
const MAX_DRAFTS = 10

function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): {
  (...args: Parameters<T>): void
  flush: () => void
} {
  let timeout: NodeJS.Timeout | null = null
  let lastArgs: Parameters<T> | null = null

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      func(...args)
      lastArgs = null
    }, wait)
  }

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    if (lastArgs) {
      func(...lastArgs)
      lastArgs = null
    }
  }

  return debounced
}

function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs ||
    'dvmTranscodeState' in updates // DVM state changes need immediate persistence (including clearing)
  )
}

// Read drafts from localStorage
function getDraftsFromStorage(): UploadDraft[] {
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
}

// Get the lastModified timestamp from localStorage
function getLocalStorageLastModified(): number {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed: UploadDraftsData = JSON.parse(stored)
      return parsed.lastModified || 0
    } catch {
      return 0
    }
  }
  return 0
}

export function useUploadDrafts() {
  // Use a counter to trigger re-renders when localStorage changes
  const [version, setVersion] = useState(0)
  const [currentDraft, setCurrentDraft] = useState<UploadDraft | null>(null)

  // Always read from localStorage (source of truth)
  const drafts = useMemo(() => {
    const freshDrafts = getDraftsFromStorage()
    if (import.meta.env.DEV) {
      console.log(
        '[useUploadDrafts] useMemo re-running with version:',
        version,
        'drafts:',
        freshDrafts
      )
    }
    return freshDrafts
  }, [version])

  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const { config, pool } = useAppContext()

  // Track in-flight Nostr saves so we can wait for them
  const inflightSaveRef = useRef<Promise<void> | null>(null)

  const saveToLocalStorage = useCallback(
    (draftsToSave: UploadDraft[]) => {
      const data: UploadDraftsData = {
        version: '1',
        lastModified: Date.now(),
        drafts: draftsToSave,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      if (import.meta.env.DEV) {
        console.log('[useUploadDrafts] saveToLocalStorage - saved drafts:', draftsToSave)
      }
      // Trigger re-render to read fresh data
      setVersion(v => {
        if (import.meta.env.DEV) {
          console.log('[useUploadDrafts] incrementing version from', v, 'to', v + 1)
        }
        return v + 1
      })
    },
    [setVersion]
  )

  const createDraft = useCallback((): UploadDraft => {
    const currentDrafts = getDraftsFromStorage()
    if (currentDrafts.length >= MAX_DRAFTS) {
      throw new Error('Maximum 10 drafts allowed')
    }

    const newDraft: UploadDraft = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      expiration: 'none',
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }

    const updated = [...currentDrafts, newDraft]
    saveToLocalStorage(updated)

    return newDraft
  }, [saveToLocalStorage])

  const saveToNostr = useCallback(
    async (draftsToSave: UploadDraft[]) => {
      if (import.meta.env.DEV) {
        console.log('[useUploadDrafts] saveToNostr called with', draftsToSave.length, 'drafts')
        console.log('[useUploadDrafts] user:', user?.pubkey ? 'logged in' : 'not logged in')
        console.log(
          '[useUploadDrafts] signer.nip44:',
          user?.signer?.nip44 ? 'available' : 'not available'
        )
      }

      if (!user?.signer?.nip44) {
        if (import.meta.env.DEV) {
          console.log('[useUploadDrafts] saveToNostr - early return (no signer or nip44)')
        }
        return
      }

      // Create async operation to save to Nostr
      const saveOperation = async () => {
        try {
          const plaintext = JSON.stringify({
            version: '1',
            lastModified: Date.now(),
            drafts: draftsToSave,
          })

          if (import.meta.env.DEV) {
            console.log('[useUploadDrafts] saveToNostr - encrypting draft data')
          }

          // Encrypt with user's own key for privacy
          const content = await user.signer.nip44!.encrypt(user.pubkey, plaintext)

          const event = {
            kind: 30078,
            content,
            created_at: nowInSecs(),
            tags: [['d', 'nostube-uploads']],
          }

          const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

          if (import.meta.env.DEV) {
            console.log('[useUploadDrafts] saveToNostr - publishing to write relays:', writeRelays)
          }

          await publish({ event, relays: writeRelays })

          if (import.meta.env.DEV) {
            console.log('[useUploadDrafts] saveToNostr - publish successful')
          }
        } catch (error) {
          console.error('[useUploadDrafts] Failed to sync to Nostr:', error)
          // Silent failure - localStorage has the data
        } finally {
          // Clear the inflight ref when done
          inflightSaveRef.current = null
        }
      }

      // Start the operation and track it
      const promise = saveOperation()
      inflightSaveRef.current = promise
      return promise
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

  // Keep a ref to the latest saveToNostr function so debounced function doesn't need to be recreated
  const saveToNostrRef = useRef(saveToNostr)
  useEffect(() => {
    saveToNostrRef.current = saveToNostr
  }, [saveToNostr])

  // Create debounced function once and keep it stable
  const debouncedSaveToNostr = useMemo(
    () =>
      debounce((draftsToSave: UploadDraft[]) => {
        // Always call the latest version via ref
        saveToNostrRef.current(draftsToSave)
      }, 5000),
    [] // Empty deps - created once and never recreated
  )

  const saveDraftsDebounced = useCallback(
    (draftsToSave: UploadDraft[]) => {
      saveToLocalStorage(draftsToSave) // Immediate
      debouncedSaveToNostr(draftsToSave) // Debounced
    },
    [saveToLocalStorage, debouncedSaveToNostr]
  )

  // Flush pending Nostr sync on unmount
  useEffect(() => {
    return () => {
      debouncedSaveToNostr.flush()
    }
  }, [debouncedSaveToNostr])

  const updateDraft = useCallback(
    (draftId: string, updates: Partial<UploadDraft>) => {
      const currentDrafts = getDraftsFromStorage()
      const updated = currentDrafts.map(d =>
        d.id === draftId ? { ...d, ...updates, updatedAt: Date.now() } : d
      )

      if (import.meta.env.DEV) {
        console.log('[useUploadDrafts] updateDraft:', { draftId, updates, updated })
      }

      // Immediate save for milestones, debounced Nostr sync for form fields
      if (isMilestoneUpdate(updates)) {
        saveDraftsImmediate(updated)
      } else {
        saveDraftsDebounced(updated)
      }
    },
    [saveDraftsImmediate, saveDraftsDebounced]
  )

  const deleteDraft = useCallback(
    (draftId: string) => {
      const currentDrafts = getDraftsFromStorage()
      const updated = currentDrafts.filter(d => d.id !== draftId)
      // Immediately save to both localStorage and Nostr
      saveToLocalStorage(updated)
      saveToNostr(updated)
    },
    [saveToLocalStorage, saveToNostr]
  )

  const mergeDraftsFromNostr = useCallback(
    (nostrDrafts: UploadDraft[], nostrEventTimestamp: number) => {
      const localDrafts = getDraftsFromStorage()
      const localLastModified = getLocalStorageLastModified()
      const draftMap = new Map<string, UploadDraft>()

      // Add local drafts first
      localDrafts.forEach(d => draftMap.set(d.id, d))

      // Only merge Nostr drafts if the Nostr event is newer than local storage
      // This prevents deleted drafts from being restored
      const nostrEventMs = nostrEventTimestamp * 1000 // Convert seconds to milliseconds
      const shouldRestoreFromNostr = nostrEventMs > localLastModified

      nostrDrafts.forEach(d => {
        const existing = draftMap.get(d.id)
        if (existing) {
          // Draft exists locally - update if Nostr version is newer
          if (d.updatedAt > existing.updatedAt) {
            draftMap.set(d.id, d)
          }
        } else if (shouldRestoreFromNostr) {
          // Draft doesn't exist locally - only add if Nostr event is newer than local storage
          // This prevents adding back drafts that were deleted locally
          draftMap.set(d.id, d)
        }
      })

      // Sort by updatedAt descending
      const merged = Array.from(draftMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)

      // Save merged result to localStorage
      saveToLocalStorage(merged)
    },
    [saveToLocalStorage]
  )

  // Subscribe to NIP-78 event changes
  useEffect(() => {
    if (!user?.pubkey || !user.signer?.nip44) return

    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

    const loader = createAddressLoader(pool)
    const sub = loader({
      kind: 30078,
      pubkey: user.pubkey,
      identifier: 'nostube-uploads',
      relays: readRelays,
    }).subscribe(async event => {
      if (event) {
        try {
          let plaintext = event.content
          if (user.signer.nip44) {
            // Try to decrypt using NIP-44 (for new encrypted drafts)
            try {
              plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content)
            } catch {
              // Ignore decryption error, assume it's a legacy unencrypted draft
            }
          }

          const parsed = JSON.parse(plaintext)
          const nostrDrafts = parsed.drafts || []
          mergeDraftsFromNostr(nostrDrafts, event.created_at)
        } catch (error) {
          console.error('Failed to parse NIP-78 event:', error)
        }
      }
    })

    return () => sub.unsubscribe()
  }, [user?.pubkey, user?.signer, pool, config.relays, mergeDraftsFromNostr])

  const refreshDrafts = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[useUploadDrafts] refreshDrafts - forcing re-fetch from localStorage')
    }
    setVersion(v => v + 1)
  }, [])

  const flushNostrSync = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log('[useUploadDrafts] flushNostrSync - forcing pending Nostr sync')
    }

    // First, flush any debounced saves (triggers the async saveToNostr)
    debouncedSaveToNostr.flush()

    // Then wait for any in-flight saves to complete
    if (inflightSaveRef.current) {
      if (import.meta.env.DEV) {
        console.log('[useUploadDrafts] flushNostrSync - waiting for in-flight save to complete')
      }
      await inflightSaveRef.current
      if (import.meta.env.DEV) {
        console.log('[useUploadDrafts] flushNostrSync - in-flight save completed')
      }
    }
  }, [debouncedSaveToNostr])

  return {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    updateDraft,
    deleteDraft,
    refreshDrafts,
    flushNostrSync,
    isLoading: false,
  }
}

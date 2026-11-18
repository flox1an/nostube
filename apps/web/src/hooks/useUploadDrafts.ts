import { useState, useCallback, useEffect, useMemo } from 'react'
import { randomUUID } from '@nostube/core/random-uuid'
import type { UploadDraft } from '@/types/upload-draft'
import { removeOldDrafts, stripRuntimeStateFromDrafts } from '@/lib/upload-draft-utils'
import { useDraftPersistence } from './useDraftPersistence'
import { getItemsFromStorage, saveItemsToStorage } from '@/lib/draft-persistence-storage'

const STORAGE_KEY = 'nostube_upload_drafts'

/** Drafts older than this are hidden from the list (and removed once space is needed). */
const DRAFT_MAX_AGE_DAYS = 30
const MAX_DRAFTS = 10

function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.originalVideoInfo ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs
  )
}

export function useUploadDrafts() {
  const persistence = useDraftPersistence<UploadDraft>({
    storageKey: STORAGE_KEY,
    nostrIdentifier: 'nostube-uploads',
    maxItems: MAX_DRAFTS,
    isMilestone: isMilestoneUpdate,
  })

  const [currentDraft, setCurrentDraft] = useState<UploadDraft | null>(null)

  // Apply age-based cleanup on read
  const drafts = useMemo(() => {
    return removeOldDrafts(stripRuntimeStateFromDrafts(persistence.items), DRAFT_MAX_AGE_DAYS)
  }, [persistence.items])

  useEffect(() => {
    const sanitized = stripRuntimeStateFromDrafts(persistence.items)
    if (JSON.stringify(sanitized) === JSON.stringify(persistence.items)) return

    saveItemsToStorage(STORAGE_KEY, sanitized)
    persistence.refreshItems()
  }, [persistence])

  const createDraftInMemory = useCallback((): UploadDraft => {
    return {
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      people: [],
      contentWarning: { enabled: false, reason: '' },
      expiration: 'none',
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      subtitles: [],
      thumbnailSource: 'generated',
    }
  }, [])

  const persistDraft = useCallback(
    (draft: UploadDraft): void => {
      // Already persisted, skip
      const existing = getItemsFromStorage<UploadDraft>(STORAGE_KEY)
      if (existing.some(d => d.id === draft.id)) return

      // Drafts past DRAFT_MAX_AGE_DAYS are hidden from the list but still count toward the
      // limit; at the limit they make room first, so an invisible draft never blocks a new one.
      if (existing.length >= MAX_DRAFTS) {
        const visible = new Set(removeOldDrafts(existing, DRAFT_MAX_AGE_DAYS).map(d => d.id))
        for (const old of existing) if (!visible.has(old.id)) persistence.deleteItem(old.id)
      }

      persistence.createItem({ ...stripRuntimeStateFromDrafts([draft])[0], updatedAt: Date.now() })
    },
    [persistence]
  )

  const createDraft = useCallback((): UploadDraft => {
    const newDraft = createDraftInMemory()
    persistDraft(newDraft)
    return newDraft
  }, [createDraftInMemory, persistDraft])

  const updateDraft = useCallback(
    (draftId: string, updates: Partial<UploadDraft>) => {
      persistence.updateItem(draftId, updates)
    },
    [persistence]
  )

  const deleteDraft = useCallback(
    (draftId: string) => {
      persistence.deleteItem(draftId)
    },
    [persistence]
  )

  const refreshDrafts = useCallback(() => {
    persistence.refreshItems()
  }, [persistence])

  const flushNostrSync = useCallback(async () => {
    await persistence.flushSync()
  }, [persistence])

  return {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    createDraftInMemory,
    persistDraft,
    updateDraft,
    deleteDraft,
    refreshDrafts,
    flushNostrSync,
    isLoading: false,
  }
}

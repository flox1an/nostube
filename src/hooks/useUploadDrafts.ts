import { useState, useCallback, useMemo } from 'react'
import type { UploadDraft } from '@/types/upload-draft'
import { removeOldDrafts } from '@/lib/upload-draft-utils'
import { useDraftPersistence } from './useDraftPersistence'
import { getItemsFromStorage } from '@/lib/draft-persistence-storage'

const STORAGE_KEY = 'nostube_upload_drafts'
const MAX_DRAFTS = 10

function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.originalVideoInfo ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs ||
    'dvmTranscodeState' in updates // DVM state changes need immediate persistence (including clearing)
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
    return removeOldDrafts(persistence.items, 30)
  }, [persistence.items])

  const createDraftInMemory = useCallback((): UploadDraft => {
    return {
      id: crypto.randomUUID(),
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

      persistence.createItem({ ...draft, updatedAt: Date.now() })
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

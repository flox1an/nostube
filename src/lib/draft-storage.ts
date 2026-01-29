/**
 * Draft Storage
 *
 * Pure functions for draft persistence in localStorage.
 * Used by UploadManagerProvider for centralized draft management.
 */

import type { UploadDraft, UploadDraftsData } from '@/types/upload-draft'
import { removeOldDrafts } from '@/lib/upload-draft-utils'

const STORAGE_KEY = 'nostube_upload_drafts'
export const MAX_DRAFTS = 10

/**
 * Get all drafts from localStorage.
 * Automatically cleans up drafts older than 30 days.
 */
export function getDraftsFromStorage(): UploadDraft[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed: UploadDraftsData = JSON.parse(stored)
      const cleaned = removeOldDrafts(parsed.drafts, 30)

      // Save cleaned version if we removed any
      if (cleaned.length !== parsed.drafts.length) {
        saveDraftsToStorage(cleaned)
      }

      return cleaned
    } catch (error) {
      console.error('[draft-storage] Failed to load drafts:', error)
    }
  }
  return []
}

/**
 * Get a single draft by ID.
 */
export function getDraftFromStorage(id: string): UploadDraft | undefined {
  const drafts = getDraftsFromStorage()
  return drafts.find(d => d.id === id)
}

/**
 * Get the lastModified timestamp from localStorage.
 * Used for merge conflict resolution with Nostr.
 */
export function getLocalStorageLastModified(): number {
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

/**
 * Save drafts to localStorage.
 */
export function saveDraftsToStorage(drafts: UploadDraft[]): void {
  const data: UploadDraftsData = {
    version: '1',
    lastModified: Date.now(),
    drafts,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

  if (import.meta.env.DEV) {
    console.log('[draft-storage] Saved', drafts.length, 'drafts to localStorage')
  }
}

/**
 * Create a new empty draft.
 * Returns the new draft (does NOT save automatically).
 */
export function createEmptyDraft(): UploadDraft {
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
}

/**
 * Update a draft in storage.
 * Returns the updated draft, or undefined if not found.
 */
export function updateDraftInStorage(
  id: string,
  updates: Partial<UploadDraft>
): UploadDraft | undefined {
  const drafts = getDraftsFromStorage()
  const index = drafts.findIndex(d => d.id === id)

  if (index === -1) {
    console.warn('[draft-storage] Draft not found:', id)
    return undefined
  }

  const updatedDraft = {
    ...drafts[index],
    ...updates,
    updatedAt: Date.now(),
  }
  drafts[index] = updatedDraft
  saveDraftsToStorage(drafts)

  return updatedDraft
}

/**
 * Delete a draft from storage.
 */
export function deleteDraftFromStorage(id: string): void {
  const drafts = getDraftsFromStorage()
  const filtered = drafts.filter(d => d.id !== id)
  saveDraftsToStorage(filtered)
}

/**
 * Add a new draft to storage.
 * Enforces MAX_DRAFTS limit.
 */
export function addDraftToStorage(draft: UploadDraft): void {
  const drafts = getDraftsFromStorage()
  if (drafts.length >= MAX_DRAFTS) {
    throw new Error(`Maximum ${MAX_DRAFTS} drafts allowed`)
  }
  saveDraftsToStorage([...drafts, draft])
}

/**
 * Check if we should merge a Nostr draft (not deleted locally).
 */
export function shouldMergeNostrDraft(nostrEventTimestamp: number): boolean {
  const localLastModified = getLocalStorageLastModified()
  const nostrEventMs = nostrEventTimestamp * 1000
  return nostrEventMs > localLastModified
}

/**
 * Merge drafts from Nostr with local drafts.
 * Returns the merged list.
 */
export function mergeDraftsFromNostr(
  nostrDrafts: UploadDraft[],
  nostrEventTimestamp: number
): UploadDraft[] {
  const localDrafts = getDraftsFromStorage()
  const localLastModified = getLocalStorageLastModified()
  const draftMap = new Map<string, UploadDraft>()

  // Add local drafts first
  localDrafts.forEach(d => draftMap.set(d.id, d))

  // Only merge Nostr drafts if the Nostr event is newer than local storage
  const nostrEventMs = nostrEventTimestamp * 1000
  const shouldRestoreFromNostr = nostrEventMs > localLastModified

  nostrDrafts.forEach(d => {
    const existing = draftMap.get(d.id)
    if (existing) {
      // Draft exists locally - update if Nostr version is newer
      if (d.updatedAt > existing.updatedAt) {
        draftMap.set(d.id, d)
      }
    } else if (shouldRestoreFromNostr) {
      // Draft doesn't exist locally - only add if Nostr event is newer
      draftMap.set(d.id, d)
    }
  })

  // Sort by updatedAt descending
  return Array.from(draftMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Determine if an update is a "milestone" that needs immediate sync.
 */
export function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs ||
    'dvmTranscodeState' in updates
  )
}

/**
 * Draft Storage
 *
 * Upload-specific draft helpers. Generic persistence logic lives in
 * draft-persistence-storage.ts and useDraftPersistence hook.
 */

import type { UploadDraft } from '@/types/upload-draft'

export const MAX_DRAFTS = 10

/**
 * Create a new empty draft with upload-specific defaults.
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
 * Determine if an update is a "milestone" that needs immediate Nostr sync.
 * Upload-specific: checks for video/thumbnail/DVM state changes.
 */
export function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs ||
    'dvmTranscodeState' in updates
  )
}

/**
 * Upload Manager Types
 *
 * Shared types for the upload manager provider and related hooks.
 */

import type { Subscription } from 'rxjs'
import type { UploadTask, TranscodeState } from '@/types/upload-manager'
import type { UploadDraft } from '@/types/upload-draft'
import type { VideoVariant } from '@/lib/video-processing'

/**
 * Active transcode job state
 */
export interface TranscodeJob {
  subscription: Subscription | null
  abortController: AbortController
  onComplete?: (video: VideoVariant) => void
  onAllComplete?: () => void
}

/**
 * Upload Manager Context - provides upload, draft, and transcode management
 */
export interface UploadManagerContextType {
  // Task state
  tasks: Map<string, UploadTask>

  // Draft state (single source of truth)
  drafts: UploadDraft[]
  currentDraftId: string | null

  // Draft CRUD operations
  createDraft(): UploadDraft
  updateDraft(id: string, updates: Partial<UploadDraft>): void
  deleteDraft(id: string): void
  getDraft(id: string): UploadDraft | undefined
  setCurrentDraftId(id: string | null): void
  refreshDrafts(): void
  flushNostrSync(): Promise<void>

  // Upload operations
  registerTask(draftId: string, title?: string): UploadTask
  updateTaskProgress(taskId: string, progress: Partial<UploadTask>): void
  completeTask(taskId: string): void
  failTask(taskId: string, error: string, retryable?: boolean): void
  cancelTask(taskId: string): void
  removeTask(taskId: string): void

  // Transcode operations - provider owns the subscriptions
  // taskId === draftId - transcoded videos are added directly to draft.uploadInfo.videos
  startTranscode(
    taskId: string,
    inputVideoUrl: string,
    resolutions: string[],
    originalDuration?: number,
    onComplete?: (video: VideoVariant) => void,
    onAllComplete?: () => void
  ): Promise<void>
  resumeTranscode(
    taskId: string,
    onComplete?: (video: VideoVariant) => void,
    onAllComplete?: () => void
  ): Promise<void>
  cancelTranscode(taskId: string): void

  // Query helpers
  getTask(taskId: string): UploadTask | undefined
  hasActiveTask(draftId: string): boolean
  getActiveTasksForDraft(draftId: string): UploadTask[]

  // Global state
  hasActiveUploads: boolean
  activeTaskCount: number
}

/**
 * Helper type for transcode state updates
 */
export type TranscodeStateUpdate = Partial<TranscodeState>

/**
 * Queue info passed during multi-resolution processing
 */
export interface ResolutionQueueInfo {
  resolutions: string[]
  currentIndex: number
  completed: string[]
}

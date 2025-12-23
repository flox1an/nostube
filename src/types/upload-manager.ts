/**
 * Upload Manager Types
 *
 * Types for the global upload manager that handles background uploads
 * and transcoding across the app.
 */

export type UploadTaskStatus =
  | 'pending' // Queued, not started
  | 'uploading' // Blossom upload in progress
  | 'mirroring' // Mirroring to additional servers
  | 'transcoding' // DVM transcode in progress
  | 'complete' // All done
  | 'error' // Failed
  | 'cancelled' // User cancelled

export interface UploadProgress {
  uploadedBytes: number
  totalBytes: number
  percentage: number
  currentServer?: string
  currentChunk?: number
  totalChunks?: number
}

export interface TranscodeState {
  status: 'discovering' | 'transcoding' | 'mirroring'
  requestEventId?: string
  dvmPubkey?: string
  inputVideoUrl?: string
  originalDuration?: number
  startedAt?: number
  currentResolution?: string
  resolutionQueue: string[]
  completedResolutions: string[]
  percentage?: number
  eta?: number
  message?: string
}

export interface UploadTaskError {
  message: string
  code?: string
  retryable: boolean
}

export interface UploadTask {
  id: string // Same as draft ID
  draftId: string
  status: UploadTaskStatus
  createdAt: number
  updatedAt: number

  // Upload progress
  uploadProgress?: UploadProgress

  // Transcode state (if active)
  transcodeState?: TranscodeState

  // Error info
  error?: UploadTaskError

  // Completion info
  completedAt?: number

  // Cached for notifications
  videoTitle?: string
}

export interface UploadManagerStorage {
  version: string
  tasks: UploadTask[]
  lastUpdated: number
}

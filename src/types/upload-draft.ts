import type { BlobDescriptor } from 'blossom-client-sdk'

// Import VideoVariant from existing type
import type { VideoVariant } from '@/lib/video-processing'

/**
 * State for persisting DVM transcode jobs across navigation.
 * Allows users to leave the upload dialog and resume when they return.
 */
export interface DvmTranscodeState {
  requestEventId: string // kind:5207 event id we published
  dvmPubkey: string // DVM handler pubkey
  inputVideoUrl: string // URL sent to DVM
  originalDuration?: number // For result parsing
  startedAt: number // For timeout detection (12h limit)
  status: 'transcoding' | 'mirroring' // Active states only
  lastStatusMessage?: string
  lastPercentage?: number
}

export interface UploadDraft {
  id: string
  createdAt: number
  updatedAt: number

  // Form fields
  title: string
  description: string
  tags: string[]
  language: string

  // Content warning
  contentWarning: {
    enabled: boolean
    reason: string
  }

  // Expiration
  expiration: 'none' | '1day' | '7days' | '1month' | '1year'

  // Input method
  inputMethod: 'file' | 'url'
  videoUrl?: string

  // Uploaded content (blob descriptors only)
  uploadInfo: {
    videos: VideoVariant[]
  }

  thumbnailUploadInfo: {
    uploadedBlobs: BlobDescriptor[]
    mirroredBlobs: BlobDescriptor[]
  }

  // Metadata
  thumbnailSource: 'generated' | 'upload'

  // DVM Transcode state (only present during active transcode)
  dvmTranscodeState?: DvmTranscodeState
}

export interface UploadDraftsData {
  version: string
  lastModified: number
  drafts: UploadDraft[]
}

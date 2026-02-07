import type { BlobDescriptor } from 'blossom-client-sdk'

// Import VideoVariant from existing type
import type { VideoVariant } from '@/lib/video-processing'

/**
 * A person tagged in the video (contributor, creator, etc.)
 */
export interface TaggedPerson {
  pubkey: string
  name: string
  picture?: string
  relays?: string[]
}

/**
 * Subtitle variant for VTT/SRT files
 */
export interface SubtitleVariant {
  id: string // Unique ID for React keys
  filename: string
  lang: string // ISO 639-1 code (e.g., 'en', 'de')
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
}

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
  // Multi-resolution support
  resolutionQueue: string[] // All resolutions to process (e.g., ['1080p', '720p', '480p'])
  completedResolutions: string[] // Already finished resolutions
  currentResolution: string // Currently processing resolution
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
  people: TaggedPerson[]

  // Content warning
  contentWarning: {
    enabled: boolean
    reason: string
  }

  // Expiration
  expiration: 'none' | '1day' | '7days' | '1month' | '1year'

  // Scheduled publishing (timestamp in seconds, undefined = publish immediately)
  publishAt?: number

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

  // Subtitles (VTT/SRT files)
  subtitles: SubtitleVariant[]

  // External origins (references to other platforms/nostr events)
  origins?: string[][][]

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

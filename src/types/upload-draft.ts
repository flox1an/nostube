import type { BlobDescriptor } from 'blossom-client-sdk'

// Import VideoVariant from existing type
import type { VideoVariant } from '@/lib/video-processing'
import type { VideoMetadata } from '@/lib/metadata-extraction'

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

export interface BrowserTranscodeVariantState {
  label: string
  progress: number
  status: 'pending' | 'active' | 'done' | 'error'
}

export interface BrowserTranscodeState {
  status: 'queued' | 'transcoding' | 'uploading' | 'complete' | 'error' | 'cancelled'
  mode: 'replace' | 'append'
  keepOriginal: boolean
  sourceName: string
  sourceSize: number
  startedAt: number
  updatedAt: number
  completedAt?: number
  variants: BrowserTranscodeVariantState[]
  uploadProgress?: {
    uploadedBytes: number
    totalBytes: number
    percentage: number
    currentChunk: number
    totalChunks: number
    speedMBps?: number
  }
  message?: string
  error?: string
}

export interface OriginalVideoInfo {
  name: string
  mimeType: string
  size: number
  sizeMB: number
  dimension: string
  duration: number
  videoCodec?: string
  audioCodec?: string
  bitrate?: number
  qualityLabel?: string
  extractedMetadata?: VideoMetadata
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

  // Metadata extracted from the original file before browser transcode starts.
  originalVideoInfo?: OriginalVideoInfo

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
}

export interface UploadDraftsData {
  version: string
  lastModified: number
  drafts: UploadDraft[]
}

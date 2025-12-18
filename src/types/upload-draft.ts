import type { BlobDescriptor } from 'blossom-client-sdk'

// Import VideoVariant from existing type
import type { VideoVariant } from '@/lib/video-processing'

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
}

export interface UploadDraftsData {
  version: string
  lastModified: number
  drafts: UploadDraft[]
}

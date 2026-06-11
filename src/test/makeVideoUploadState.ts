import type { FormEvent } from 'react'
import { vi } from 'vitest'
import type { ThumbnailUploadInfo, UploadInfo } from '@/hooks/useVideoUpload'
import type { BrowserTranscodeState, SubtitleVariant } from '@/types/upload-draft'

/**
 * Builds a minimal stub of the object returned by useVideoUpload.
 * Only the fields VideoUpload.tsx destructures need to be present.
 * Pass overrides to control individual fields in tests.
 */
export function makeVideoUploadState(
  overrides: Partial<VideoUploadStateStub> = {}
): VideoUploadStateStub {
  const noop = vi.fn()
  const asyncNoop = vi.fn().mockResolvedValue(undefined)

  const defaultUploadInfo: UploadInfo = { videos: [] }
  const defaultThumbUploadInfo: ThumbnailUploadInfo = {
    uploadedBlobs: [],
    mirroredBlobs: [],
    uploading: false,
  }

  const base: VideoUploadStateStub = {
    title: '',
    setTitle: noop,
    description: '',
    setDescription: noop,
    tags: [],
    setTags: noop,
    language: 'en',
    setLanguage: noop,
    people: [],
    setPeople: noop,
    origins: [],
    setOrigins: noop,
    inputMethod: 'file' as const,
    setInputMethod: noop,
    videoUrl: '',
    setVideoUrl: noop,
    file: null,
    thumbnail: null,
    setThumbnail: noop,
    uploadInfo: defaultUploadInfo,
    originalVideoInfo: undefined,
    uploadState: 'initial' as const,
    thumbnailBlob: null,
    thumbnailSource: 'generated' as const,
    thumbnailUploadInfo: defaultThumbUploadInfo,
    contentWarningEnabled: false,
    setContentWarningEnabled: noop,
    contentWarningReason: '',
    setContentWarningReason: noop,
    expiration: 'none' as const,
    setExpiration: noop,
    publishAt: undefined,
    setPublishAt: noop,
    uploadProgress: null,
    workflowState: null,
    browserTranscodeState: undefined,
    publishSummary: { fallbackUrls: [] },
    publishRelays: null,
    setPublishRelays: noop,
    writeRelays: [],
    blossomInitalUploadServers: [],
    blossomMirrorServers: [],
    isPublishing: false,
    thumbnailUrl: undefined,
    previewEvent: null,
    videoToDelete: null,
    setVideoToDelete: noop,
    deletingIndex: null,
    subtitles: [] as SubtitleVariant[],
    subtitleUploading: false,
    metadataDetected: false,

    handleUrlVideoProcessing: asyncNoop,
    handleThumbnailDrop: asyncNoop,
    handleAutoThumbnailCapture: asyncNoop,
    handleThumbnailSourceChange: noop,
    handleDeleteThumbnail: asyncNoop,
    onDrop: asyncNoop,
    handleBrowserTranscodeComplete: asyncNoop,
    handleBrowserTranscodeSkip: asyncNoop,
    handleStartBrowserTranscodeUpload: asyncNoop,
    handleCancelBrowserTranscodeUpload: noop,
    handleReset: noop,
    handleSubmit: asyncNoop,
    handleAddVideo: asyncNoop,
    handleRemoveVideo: noop,
    handleRemoveVideoFromFormOnly: noop,
    handleRemoveVideoWithBlobs: asyncNoop,
    handleAddTranscodedVideo: noop,
    handleSubtitleDrop: asyncNoop,
    handleRemoveSubtitle: asyncNoop,
    handleSubtitleLanguageChange: noop,
  }

  return { ...base, ...overrides }
}

// Structural type matching the destructured fields in VideoUpload.tsx.
// Intentionally not imported from useVideoUpload to avoid coupling tests to implementation.
export interface VideoUploadStateStub {
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  tags: string[]
  setTags: (v: string[]) => void
  language: string
  setLanguage: (v: string) => void
  people: Array<{ pubkey: string; name: string }>
  setPeople: (v: Array<{ pubkey: string; name: string }>) => void
  origins: string[][][]
  setOrigins: (v: string[][][]) => void
  inputMethod: 'file' | 'url'
  setInputMethod: (v: 'file' | 'url') => void
  videoUrl: string
  setVideoUrl: (v: string) => void
  file: File | null
  thumbnail: File | null
  setThumbnail: (v: File | null) => void
  uploadInfo: UploadInfo
  originalVideoInfo: undefined | object
  uploadState: 'initial' | 'transcoding' | 'uploading' | 'finished'
  thumbnailBlob: Blob | null
  thumbnailSource: 'generated' | 'upload'
  thumbnailUploadInfo: ThumbnailUploadInfo
  contentWarningEnabled: boolean
  setContentWarningEnabled: (v: boolean) => void
  contentWarningReason: string
  setContentWarningReason: (v: string) => void
  expiration: 'none' | '1day' | '7days' | '1month' | '1year'
  setExpiration: (v: 'none' | '1day' | '7days' | '1month' | '1year') => void
  publishAt: number | undefined
  setPublishAt: (v: number | undefined) => void
  uploadProgress: null | object
  workflowState: null | object
  browserTranscodeState: BrowserTranscodeState | undefined
  publishSummary: { fallbackUrls: string[] }
  publishRelays: string[] | null
  setPublishRelays: (v: string[] | null) => void
  writeRelays: string[]
  blossomInitalUploadServers: Array<{ url: string; tags: string[] }> | undefined
  blossomMirrorServers: Array<{ url: string; tags: string[] }> | undefined
  isPublishing: boolean
  thumbnailUrl: string | undefined
  previewEvent: null | object
  videoToDelete: null | object
  setVideoToDelete: (v: null | object) => void
  deletingIndex: number | null
  subtitles: SubtitleVariant[]
  subtitleUploading: boolean
  metadataDetected: boolean
  handleUrlVideoProcessing: (url: string) => Promise<void>
  handleThumbnailDrop: (files: File[]) => Promise<void>
  handleAutoThumbnailCapture: (blob: Blob) => Promise<void>
  handleThumbnailSourceChange: (v: string) => void
  handleDeleteThumbnail: () => Promise<void>
  onDrop: (files: File[]) => Promise<void>
  handleBrowserTranscodeComplete: (files: File[] | Map<string, File>) => Promise<void>
  handleBrowserTranscodeSkip: () => Promise<void>
  handleStartBrowserTranscodeUpload: (...args: unknown[]) => Promise<void>
  handleCancelBrowserTranscodeUpload: () => void
  handleReset: () => void
  handleSubmit: (e: FormEvent) => Promise<void>
  handleAddVideo: (files: File[]) => Promise<void>
  handleRemoveVideo: (index: number) => void
  handleRemoveVideoFromFormOnly: () => void
  handleRemoveVideoWithBlobs: () => Promise<void>
  handleAddTranscodedVideo: (video: object) => void
  handleSubtitleDrop: (files: File[]) => Promise<void>
  handleRemoveSubtitle: (id: string) => Promise<void>
  handleSubtitleLanguageChange: (id: string, lang: string) => void
}

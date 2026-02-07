import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useCurrentUser, useAppContext, useNostrPublish, useSelectedPreset } from '@/hooks'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  deleteBlobsFromServers,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { nowInSecs } from '@/lib/utils'
import { type VideoVariant, processUploadedVideo, processVideoUrl } from '@/lib/video-processing'
import { buildImetaTags } from '@/lib/imeta-builder'
import type { UploadDraft, SubtitleVariant, TaggedPerson } from '@/types/upload-draft'
import { parseBlossomUrl } from '@/lib/blossom-url'
import { detectLanguageFromFilename, generateSubtitleId } from '@/lib/subtitle-utils'
import { generateBlurhash } from '@/lib/blurhash-encode'
import { deriveServerName } from '@/lib/blossom-servers'
import { type BlossomServerTag } from '@/contexts/AppContext'
import {
  publishMirrorAnnouncements,
  getMirrorAnnouncementRelays,
  type MirrorAnnouncementOptions,
} from '@/lib/mirror-announcements'

interface BuildVideoEventParams {
  videos: VideoVariant[]
  title: string
  description: string
  tags: string[]
  language: string
  people: TaggedPerson[]
  contentWarningEnabled: boolean
  contentWarningReason: string
  expiration: 'none' | '1day' | '7days' | '1month' | '1year'
  thumbnailUploadedBlobs: BlobDescriptor[]
  thumbnailMirroredBlobs: BlobDescriptor[]
  subtitles: SubtitleVariant[]
  draftId: string // Used as the 'd' tag for addressable events
  thumbnailBlurhash?: string // Blurhash for thumbnail placeholder
  isPreview?: boolean
  hasPendingThumbnail?: boolean
  publishAt?: number // Scheduled publish timestamp (seconds), undefined = now
  origins?: string[][][] // External platform references
}

interface BuildVideoEventResult {
  event: {
    kind: number
    content: string
    created_at: number | string
    tags: string[][]
  }
  allFallbackUrls: string[]
  primaryVideoUrl: string | undefined
}

/**
 * Builds a video event from the provided parameters.
 * Used for both preview and actual publishing.
 */
function buildVideoEvent(params: BuildVideoEventParams): BuildVideoEventResult {
  const {
    videos,
    title,
    description,
    tags,
    language,
    people,
    contentWarningEnabled,
    contentWarningReason,
    expiration,
    thumbnailUploadedBlobs,
    thumbnailMirroredBlobs,
    subtitles,
    draftId,
    thumbnailBlurhash,
    isPreview = false,
    hasPendingThumbnail = false,
    publishAt,
    origins = [],
  } = params

  const firstVideo = videos[0]
  const [width, height] = firstVideo.dimension.split('x').map(Number)
  // Use addressable event kinds (NIP-71): 34235 for normal videos, 34236 for shorts
  const kind = height > width ? 34236 : 34235

  // Create multiple imeta tags - one for each video variant (using shared builder)
  const { imetaTags, allFallbackUrls } = buildImetaTags({
    videos,
    thumbnailUploadedBlobs,
    thumbnailMirroredBlobs,
    thumbnailBlurhash,
    isPreview,
    hasPendingThumbnail,
  })

  // Calculate expiration timestamp
  const getExpirationTimestamp = (): string | null => {
    if (expiration === 'none') return null

    const now = Math.floor(Date.now() / 1000)
    const durations = {
      '1day': 24 * 60 * 60,
      '7days': 7 * 24 * 60 * 60,
      '1month': 30 * 24 * 60 * 60,
      '1year': 365 * 24 * 60 * 60,
    }

    return (now + durations[expiration]).toString()
  }

  // created_at is always the current time (when the event is actually published)
  // published_at carries the user-chosen publish date (or current time if not scheduled)
  const createdAt = isPreview ? '<generated on publish>' : nowInSecs()
  const publishedAt = isPreview
    ? publishAt
      ? publishAt.toString()
      : '<generated on publish>'
    : (publishAt ?? nowInSecs()).toString()

  // Build text-track tags for subtitles
  const textTrackTags: string[][] = subtitles
    .filter(s => s.uploadedBlobs.length > 0 && s.lang)
    .map(s => ['text-track', s.uploadedBlobs[0].url, s.lang])

  const event = {
    kind,
    content: description,
    created_at: createdAt,
    tags: [
      ['d', draftId], // Addressable event identifier (NIP-71)
      ['title', title],
      ['alt', description],
      ['published_at', publishedAt],
      ['duration', firstVideo.duration.toString()],
      ...imetaTags,
      ...textTrackTags,
      ...(contentWarningEnabled
        ? [['content-warning', contentWarningReason.trim() ? contentWarningReason : 'NSFW']]
        : []),
      ...(getExpirationTimestamp() ? [['expiration', getExpirationTimestamp()!]] : []),
      ...tags.map(tag => ['t', tag]),
      ...people.map(person =>
        person.relays && person.relays.length > 0
          ? ['p', person.pubkey, person.relays[0]]
          : ['p', person.pubkey]
      ),
      ...origins.flat(),
      ['L', 'ISO-639-1'],
      ['l', language, 'ISO-639-1'],
      ['client', 'nostube'],
    ],
  }

  const firstVideoBlobs = firstVideo.uploadedBlobs || []
  const primaryVideoUrl =
    firstVideo.inputMethod === 'url' ? firstVideo.url : firstVideoBlobs[0]?.url

  return { event, allFallbackUrls, primaryVideoUrl }
}

export interface UploadInfo {
  videos: VideoVariant[]
}

export interface ThumbnailUploadInfo {
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
  uploading: boolean
  error?: string
}

export interface PublishSummary {
  eventId?: string
  primaryUrl?: string
  fallbackUrls: string[]
}

export function useVideoUpload(
  initialDraft?: UploadDraft,
  onDraftChange?: (updates: Partial<UploadDraft>) => void
) {
  const [title, setTitle] = useState(initialDraft?.title || '')
  const [description, setDescription] = useState(initialDraft?.description || '')
  const [tags, setTags] = useState<string[]>(() => {
    // Deduplicate tags when loading from draft
    const draftTags = initialDraft?.tags || []
    return [...new Set(draftTags)]
  })
  const [language, setLanguage] = useState(initialDraft?.language || 'en')
  const [people, setPeople] = useState<TaggedPerson[]>(initialDraft?.people || [])
  const [origins, setOrigins] = useState<string[][][]>(initialDraft?.origins || [])
  const [inputMethod, setInputMethod] = useState<'file' | 'url'>(
    initialDraft?.inputMethod || 'file'
  )
  const [videoUrl, setVideoUrl] = useState(initialDraft?.videoUrl || '')
  const [file, setFile] = useState<File | null>(null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [uploadInfo, setUploadInfo] = useState<UploadInfo>(
    initialDraft?.uploadInfo || { videos: [] }
  )
  const [uploadState, setUploadState] = useState<'initial' | 'uploading' | 'finished'>(
    initialDraft?.uploadInfo && initialDraft.uploadInfo.videos.length > 0 ? 'finished' : 'initial'
  )
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null)
  const [thumbnailBlurhash, setThumbnailBlurhash] = useState<string | undefined>(undefined)
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>(
    initialDraft?.thumbnailSource || 'generated'
  )
  const [thumbnailUploadInfo, setThumbnailUploadInfo] = useState<ThumbnailUploadInfo>({
    uploadedBlobs: initialDraft?.thumbnailUploadInfo.uploadedBlobs || [],
    mirroredBlobs: initialDraft?.thumbnailUploadInfo.mirroredBlobs || [],
    uploading: false,
  })
  const [contentWarningEnabled, setContentWarningEnabled] = useState(
    initialDraft?.contentWarning.enabled || false
  )
  const [contentWarningReason, setContentWarningReason] = useState(
    initialDraft?.contentWarning.reason || ''
  )
  const [expiration, setExpiration] = useState<'none' | '1day' | '7days' | '1month' | '1year'>(
    initialDraft?.expiration || 'none'
  )
  const [publishAt, setPublishAt] = useState<number | undefined>(initialDraft?.publishAt)
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)
  const [publishSummary, setPublishSummary] = useState<PublishSummary>({ fallbackUrls: [] })

  // Subtitles state
  const [subtitles, setSubtitles] = useState<SubtitleVariant[]>(initialDraft?.subtitles || [])
  const [subtitleUploading, setSubtitleUploading] = useState(false)

  // Draft ID for addressable event 'd' tag - use existing draft ID or generate new UUID
  const [draftId] = useState(() => initialDraft?.id || crypto.randomUUID())

  // State for video deletion dialog
  const [videoToDelete, setVideoToDelete] = useState<{
    index: number
    video: VideoVariant
  } | null>(null)

  // Use ref to store callback to prevent infinite loop
  const onDraftChangeRef = useRef(onDraftChange)

  // Update ref when callback changes
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange
  }, [onDraftChange])

  // Auto-populate form fields from extracted metadata
  const metadataAppliedRef = useRef(false)
  const [metadataDetected, setMetadataDetected] = useState(false)

  useEffect(() => {
    const firstVideo = uploadInfo.videos[0]

    // Only apply metadata once, when video is first uploaded
    if (!firstVideo?.extractedMetadata || metadataAppliedRef.current) {
      return
    }

    const meta = firstVideo.extractedMetadata
    let applied = false

    if (import.meta.env.DEV) {
      console.log('[useVideoUpload] Auto-populating from metadata:', meta)
    }

    // Only populate if fields are empty (don't overwrite user input)
    if (!title && meta.title) {
      setTitle(meta.title)
      applied = true
    }

    if (!description && meta.description) {
      setDescription(meta.description)
      applied = true
    }

    if (tags.length === 0 && meta.tags && meta.tags.length > 0) {
      setTags(meta.tags)
      applied = true
    }

    if (!publishAt && meta.publishAt) {
      setPublishAt(meta.publishAt)
      applied = true
    }

    // Mark as applied and notify
    if (applied) {
      metadataAppliedRef.current = true
      setMetadataDetected(true)
      if (import.meta.env.DEV) {
        console.log('[useVideoUpload] Metadata auto-populated successfully')
      }
    }
  }, [uploadInfo.videos, title, description, tags.length, publishAt])

  const { user } = useCurrentUser()
  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const { publish, isPending: isPublishing } = useNostrPublish()

  const blossomInitalUploadServers = config.blossomServers?.filter(server =>
    server.tags.includes('initial upload')
  )
  const blossomMirrorServers = config.blossomServers?.filter(server =>
    server.tags.includes('mirror')
  )

  const handleUseRecommendedServers = () => {
    updateConfig(currentConfig => {
      const servers: { url: string; name: string; tags: BlossomServerTag[] }[] = []
      if (presetContent.defaultBlossomProxy) {
        servers.push({
          url: presetContent.defaultBlossomProxy,
          name: deriveServerName(presetContent.defaultBlossomProxy),
          tags: ['initial upload', 'mirror'] as BlossomServerTag[],
        })
      }
      return {
        ...currentConfig,
        blossomServers: servers,
      }
    })
  }

  const handleUrlVideoProcessing = async (url: string) => {
    if (!url) return

    setUploadInfo({ videos: [] })
    setUploadState('uploading')

    try {
      const blossomInfo = parseBlossomUrl(url)
      let mirroredBlobs: BlobDescriptor[] = []

      if (
        blossomInfo.isBlossomUrl &&
        blossomInfo.sha256 &&
        user &&
        blossomMirrorServers &&
        blossomMirrorServers.length > 0
      ) {
        try {
          const originalBlob: BlobDescriptor = {
            url: url,
            sha256: blossomInfo.sha256,
            size: 0,
            type: 'video/mp4',
            uploaded: Date.now(),
          }

          mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: originalBlob,
            signer: async draft => await user.signer.signEvent(draft),
          })
        } catch (error) {
          console.error('Failed to mirror Blossom URL:', error)
        }
      }

      const videoVariant = await processVideoUrl(url, mirroredBlobs)

      setUploadInfo({
        videos: [videoVariant],
      })

      setUploadState('finished')
    } catch (error) {
      console.error('Failed to process video URL:', error)
      setUploadState('initial')
      setUploadInfo({ videos: [] })
    }
  }

  const handleThumbnailDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles[0] || !blossomInitalUploadServers || !user) return
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: true })
    try {
      const uploadedBlobs = await uploadFileToMultipleServersChunked({
        file: acceptedFiles[0],
        servers: blossomInitalUploadServers.map(server => server.url),
        signer: async draft => await user.signer.signEvent(draft),
      })
      let mirroredBlobs: BlobDescriptor[] = []
      if (blossomMirrorServers && blossomMirrorServers.length > 0 && uploadedBlobs[0]) {
        mirroredBlobs = await mirrorBlobsToServers({
          mirrorServers: blossomMirrorServers.map(s => s.url),
          blob: uploadedBlobs[0],
          signer: async draft => await user.signer.signEvent(draft),
        })
      }
      setThumbnailUploadInfo({ uploadedBlobs, mirroredBlobs, uploading: false })
      setThumbnail(acceptedFiles[0])

      // Generate blurhash for the uploaded thumbnail
      const blurhash = await generateBlurhash(acceptedFiles[0])
      setThumbnailBlurhash(blurhash)
    } catch {
      setThumbnailUploadInfo({
        uploadedBlobs: [],
        mirroredBlobs: [],
        uploading: false,
        error: 'Failed to upload thumbnail.',
      })
    }
  }

  const handleThumbnailSourceChange = (value: string) => {
    setThumbnailSource(value as 'generated' | 'upload')
    if (value === 'generated') {
      setThumbnail(null)
    }
  }

  // Handler to delete uploaded thumbnail and remove blobs from servers
  const handleDeleteThumbnail = async () => {
    if (!user) return

    const allBlobs = [...thumbnailUploadInfo.uploadedBlobs, ...thumbnailUploadInfo.mirroredBlobs]

    if (allBlobs.length > 0) {
      await deleteBlobsFromServers(allBlobs, async draft => await user.signer.signEvent(draft))
    }

    // Reset thumbnail state
    setThumbnail(null)
    setThumbnailBlob(null)
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: false })
    setThumbnailBlurhash(undefined)
    setThumbnailSource('upload')
  }

  const onDrop = async (acceptedFiles: File[]) => {
    if (
      acceptedFiles &&
      acceptedFiles[0] &&
      blossomInitalUploadServers &&
      blossomInitalUploadServers.length > 0 &&
      user
    ) {
      const file = acceptedFiles[0] ?? null

      setFile(file)
      setUploadInfo({ videos: [] })
      setUploadState('uploading')
      setUploadProgress(null)

      try {
        setUploadProgress({
          uploadedBytes: 0,
          totalBytes: acceptedFiles[0].size,
          percentage: 0,
          currentChunk: 0,
          totalChunks: 1,
        })

        const uploadedBlobs = await uploadFileToMultipleServersChunked({
          file: acceptedFiles[0],
          servers: blossomInitalUploadServers.map(server => server.url),
          signer: async draft => await user.signer.signEvent(draft),
          options: {
            chunkSize: 10 * 1024 * 1024,
            maxConcurrentChunks: 2,
          },
          callbacks: {
            onProgress: progress => {
              setUploadProgress(progress)
            },
          },
        })

        const videoVariant = await processUploadedVideo(acceptedFiles[0], uploadedBlobs)

        setUploadInfo({
          videos: [videoVariant],
        })

        if (blossomMirrorServers && blossomMirrorServers.length > 0) {
          const mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: uploadedBlobs[0],
            signer: async draft => await user.signer.signEvent(draft),
          })
          setUploadInfo(ui => ({
            videos: ui.videos.map((v, i) => (i === 0 ? { ...v, mirroredBlobs } : v)),
          }))
        }
      } catch (error) {
        console.error('BUD-10 upload failed:', error)
        setUploadState('initial')
        setUploadInfo({ videos: [] })
        setUploadProgress(null)

        if (error instanceof Error) {
          if (error.name === 'NotReadableError' || error.message.includes('NotReadableError')) {
            alert(
              `Upload failed: File cannot be read by browser.\n\n` +
                `This usually happens with very large files (>2GB) or corrupted files.\n\n` +
                `Solutions:\n` +
                `• Try reducing file size\n` +
                `• Use Chrome browser (better large file support)\n` +
                `• Check if file is corrupted\n` +
                `• Close other browser tabs to free memory\n\n` +
                `Error: ${error.message}`
            )
          } else if (error.message.includes('File too large for browser')) {
            alert(
              `Upload failed: File too large for browser to process.\n\n` +
                `Try:\n` +
                `• Reducing file size\n` +
                `• Using Chrome browser\n` +
                `• Closing other browser tabs\n\n` +
                `Error: ${error.message}`
            )
          } else if (error.message.includes('does not support PATCH chunked uploads')) {
            alert(
              `Upload failed: Server does not support BUD-10 PATCH chunked uploads.\n\n${error.message}\n\nTry using a different server that supports BUD-10 specification.`
            )
          } else if (error.message.includes('BUD-10 PATCH chunked upload failed')) {
            alert(
              `Upload failed: BUD-10 PATCH upload failed.\n\n${error.message}\n\nThis server may not be BUD-10 compliant. Try a different server.`
            )
          } else if (error.message.includes('OPTIONS /upload failed')) {
            alert(
              `Upload failed: Server capabilities negotiation failed.\n\n${error.message}\n\nThis server may not support BUD-10. Try a different server.`
            )
          } else {
            alert(`Upload failed: ${error.message}`)
          }
        } else {
          alert('Upload failed due to an unknown error. Please try again.')
        }
      }
    }
    setUploadState('finished')
    setUploadProgress(null)
  }

  const thumbnailUrl = useMemo(() => {
    if (!thumbnailBlob) return undefined
    return URL.createObjectURL(thumbnailBlob as Blob)
  }, [thumbnailBlob])

  useEffect(() => {
    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl)
      }
    }
  }, [thumbnailUrl])

  const handleReset = () => {
    setTitle('')
    setDescription('')
    setTags([])
    setOrigins([])
    setInputMethod('file')
    setVideoUrl('')
    setFile(null)
    setThumbnail(null)
    setUploadInfo({ videos: [] })
    setUploadState('initial')
    setThumbnailBlob(null)
    setThumbnailBlurhash(undefined)
    setThumbnailSource('generated')
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: false })
    setUploadProgress(null)
  }

  // Handler to add another video
  const handleAddVideo = async (acceptedFiles: File[]) => {
    if (
      !acceptedFiles ||
      !acceptedFiles[0] ||
      !blossomInitalUploadServers ||
      blossomInitalUploadServers.length === 0 ||
      !user
    ) {
      return
    }

    setUploadState('uploading')
    setUploadProgress(null)

    try {
      setUploadProgress({
        uploadedBytes: 0,
        totalBytes: acceptedFiles[0].size,
        percentage: 0,
        currentChunk: 0,
        totalChunks: 1,
      })

      const uploadedBlobs = await uploadFileToMultipleServersChunked({
        file: acceptedFiles[0],
        servers: blossomInitalUploadServers.map(server => server.url),
        signer: async draft => await user.signer.signEvent(draft),
        options: {
          chunkSize: 10 * 1024 * 1024,
          maxConcurrentChunks: 2,
        },
        callbacks: {
          onProgress: progress => {
            setUploadProgress(progress)
          },
        },
      })

      const videoVariant = await processUploadedVideo(acceptedFiles[0], uploadedBlobs)

      setUploadInfo(ui => ({
        videos: [...ui.videos, videoVariant],
      }))

      if (blossomMirrorServers && blossomMirrorServers.length > 0) {
        const mirroredBlobs = await mirrorBlobsToServers({
          mirrorServers: blossomMirrorServers.map(s => s.url),
          blob: uploadedBlobs[0],
          signer: async draft => await user.signer.signEvent(draft),
        })
        setUploadInfo(ui => ({
          videos: ui.videos.map((v, i) =>
            i === ui.videos.length - 1 ? { ...v, mirroredBlobs } : v
          ),
        }))
      }

      setUploadState('finished')
    } catch (error) {
      console.error('Failed to add video:', error)
      setUploadState('finished')
      alert(`Failed to upload video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploadProgress(null)
    }
  }

  // Handler to initiate video variant removal (opens dialog)
  const handleRemoveVideo = (index: number) => {
    const video = uploadInfo.videos[index]
    if (video) {
      setVideoToDelete({ index, video })
    }
  }

  // Handler to remove video from form only (without deleting blobs)
  const handleRemoveVideoFromFormOnly = () => {
    if (videoToDelete === null) return
    const { video, index } = videoToDelete

    // If removing a 720p video, clear the DVM transcode state
    if (video.qualityLabel === '720p' && onDraftChangeRef.current) {
      onDraftChangeRef.current({ dvmTranscodeState: undefined })
    }

    setUploadInfo(ui => ({
      videos: ui.videos.filter((_, i) => i !== index),
    }))
    setVideoToDelete(null)
  }

  // Handler to remove video and delete blobs from all servers
  const handleRemoveVideoWithBlobs = async () => {
    if (videoToDelete === null || !user) return

    const { video, index } = videoToDelete

    // If removing a 720p video, clear the DVM transcode state
    if (video.qualityLabel === '720p' && onDraftChangeRef.current) {
      onDraftChangeRef.current({ dvmTranscodeState: undefined })
    }

    // Delete all blobs from their servers
    const allBlobs = [...video.uploadedBlobs, ...video.mirroredBlobs]
    const { totalSuccessful, totalFailed } = await deleteBlobsFromServers(
      allBlobs,
      async draft => await user.signer.signEvent(draft)
    )

    // Remove video from form state
    setUploadInfo(ui => ({
      videos: ui.videos.filter((_, i) => i !== index),
    }))
    setVideoToDelete(null)

    return { successful: totalSuccessful, failed: totalFailed }
  }

  // Handler to add a transcoded video variant (from DVM)
  const handleAddTranscodedVideo = (transcodedVideo: VideoVariant) => {
    setUploadInfo(ui => {
      // Check if video with same URL already exists to prevent duplicates
      const isDuplicate = ui.videos.some(v => v.url === transcodedVideo.url)
      if (isDuplicate) {
        if (import.meta.env.DEV) {
          console.log('[useVideoUpload] Skipping duplicate video:', transcodedVideo.url)
        }
        return ui
      }
      return { videos: [...ui.videos, transcodedVideo] }
    })
  }

  // Handler for subtitle file drop
  const handleSubtitleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!blossomInitalUploadServers || blossomInitalUploadServers.length === 0 || !user) {
        return
      }

      setSubtitleUploading(true)

      for (const file of acceptedFiles) {
        const id = generateSubtitleId()
        const lang = detectLanguageFromFilename(file.name)

        // Add subtitle with pending status
        const newSubtitle: SubtitleVariant = {
          id,
          filename: file.name,
          lang,
          uploadedBlobs: [],
          mirroredBlobs: [],
        }
        setSubtitles(prev => [...prev, newSubtitle])

        try {
          // Upload to Blossom servers
          const uploadedBlobs = await uploadFileToMultipleServersChunked({
            file,
            servers: blossomInitalUploadServers.map(server => server.url),
            signer: async draft => await user.signer.signEvent(draft),
          })

          let mirroredBlobs: BlobDescriptor[] = []
          if (blossomMirrorServers && blossomMirrorServers.length > 0 && uploadedBlobs[0]) {
            mirroredBlobs = await mirrorBlobsToServers({
              mirrorServers: blossomMirrorServers.map(s => s.url),
              blob: uploadedBlobs[0],
              signer: async draft => await user.signer.signEvent(draft),
            })
          }

          // Update subtitle with uploaded blobs
          setSubtitles(prev =>
            prev.map(s => (s.id === id ? { ...s, uploadedBlobs, mirroredBlobs } : s))
          )
        } catch (error) {
          console.error('Failed to upload subtitle:', error)
          // Remove failed subtitle
          setSubtitles(prev => prev.filter(s => s.id !== id))
        }
      }

      setSubtitleUploading(false)
    },
    [blossomInitalUploadServers, blossomMirrorServers, user]
  )

  // Handler to remove a subtitle
  const handleRemoveSubtitle = useCallback(
    async (id: string) => {
      const subtitle = subtitles.find(s => s.id === id)
      if (!subtitle || !user) {
        setSubtitles(prev => prev.filter(s => s.id !== id))
        return
      }

      // Delete blobs from servers if they exist
      const allBlobs = [...subtitle.uploadedBlobs, ...subtitle.mirroredBlobs]
      if (allBlobs.length > 0) {
        await deleteBlobsFromServers(allBlobs, async draft => await user.signer.signEvent(draft))
      }

      setSubtitles(prev => prev.filter(s => s.id !== id))
    },
    [subtitles, user]
  )

  // Handler to change subtitle language
  const handleSubtitleLanguageChange = useCallback((id: string, lang: string) => {
    setSubtitles(prev => prev.map(s => (s.id === id ? { ...s, lang } : s)))
  }, [])

  const handleSubmit = async (
    e: React.FormEvent
  ): Promise<{ id: string; kind: number; pubkey: string; identifier: string } | undefined> => {
    e.preventDefault()
    if (!user) return undefined

    setPublishSummary({ fallbackUrls: [] })

    // Validate that we have at least one video
    if (uploadInfo.videos.length === 0) return undefined

    let thumbnailUploadedBlobs: BlobDescriptor[] = []
    let thumbnailMirroredBlobs: BlobDescriptor[] = []

    // If we have uploaded blobs already (from manual upload or "Set as Thumbnail"), use them
    if (thumbnailUploadInfo.uploadedBlobs.length > 0) {
      thumbnailUploadedBlobs = thumbnailUploadInfo.uploadedBlobs
      thumbnailMirroredBlobs = thumbnailUploadInfo.mirroredBlobs
    } else if (thumbnailSource === 'generated' && thumbnailBlob) {
      // Fallback for any legacy flow or auto-upload on publish
      const thumbnailFile = new File([thumbnailBlob], 'thumbnail.webp', {
        type: thumbnailBlob.type || 'image/webp',
        lastModified: Date.now(),
      })

      try {
        thumbnailUploadedBlobs = await uploadFileToMultipleServersChunked({
          file: thumbnailFile,
          servers: blossomInitalUploadServers!.map(server => server.url),
          signer: async draft => await user.signer.signEvent(draft),
        })

        if (blossomMirrorServers && blossomMirrorServers.length > 0 && thumbnailUploadedBlobs[0]) {
          thumbnailMirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: thumbnailUploadedBlobs[0],
            signer: async draft => await user.signer.signEvent(draft),
          })
        }
      } catch (error) {
        console.error('Failed to upload generated thumbnail:', error)
        throw new Error('Failed to upload generated thumbnail')
      }
    }

    if (thumbnailUploadedBlobs.length === 0) {
      throw new Error('No valid thumbnail available')
    }

    try {
      // Build the event using the shared function
      const { event, allFallbackUrls, primaryVideoUrl } = buildVideoEvent({
        videos: uploadInfo.videos,
        title,
        description,
        tags,
        language,
        people,
        contentWarningEnabled,
        contentWarningReason,
        expiration,
        thumbnailUploadedBlobs,
        thumbnailMirroredBlobs,
        subtitles,
        draftId,
        thumbnailBlurhash,
        isPreview: false,
        publishAt,
        origins,
      })

      const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

      const publishedEvent = await publish({
        event: event as { kind: number; content: string; created_at: number; tags: string[][] },
        relays: writeRelays,
      })

      // Publish kind 1063 events for mirrored blobs (non-blocking)
      // This announces the new file locations so other viewers can discover them
      try {
        // Build announcements directly from uploadInfo (more efficient than building VideoEvent)
        const announcements: MirrorAnnouncementOptions[] = []
        const relayHint = writeRelays[0] || ''

        // Add video mirrored blobs
        for (const video of uploadInfo.videos) {
          if (video.mirroredBlobs.length > 0 && video.uploadedBlobs[0]?.sha256 && video.url) {
            announcements.push({
              blob: {
                type: 'video',
                variant: {
                  url: video.url,
                  hash: video.uploadedBlobs[0].sha256,
                  size: video.sizeMB ? Math.round(video.sizeMB * 1024 * 1024) : undefined,
                  dimensions: video.dimension,
                  mimeType: video.file?.type,
                  quality: video.qualityLabel,
                  fallbackUrls: video.mirroredBlobs.map(b => b.url),
                },
                label: `Video ${video.qualityLabel || video.dimension}`,
                hash: video.uploadedBlobs[0].sha256,
                ext: 'mp4',
              },
              mirrorResults: video.mirroredBlobs,
              videoEvent: {
                id: publishedEvent.id,
                kind: publishedEvent.kind,
                pubkey: publishedEvent.pubkey,
                dTag: draftId,
              },
              relayHint,
            })
          }
        }

        // Add thumbnail mirrored blobs
        if (thumbnailMirroredBlobs.length > 0 && thumbnailUploadedBlobs[0]?.sha256) {
          announcements.push({
            blob: {
              type: 'thumbnail',
              variant: {
                url: thumbnailUploadedBlobs[0].url,
                hash: thumbnailUploadedBlobs[0].sha256,
                size: thumbnailUploadedBlobs[0].size,
                fallbackUrls: thumbnailMirroredBlobs.map(b => b.url),
              },
              label: 'Thumbnail',
              hash: thumbnailUploadedBlobs[0].sha256,
              ext: 'webp',
            },
            mirrorResults: thumbnailMirroredBlobs,
            videoEvent: {
              id: publishedEvent.id,
              kind: publishedEvent.kind,
              pubkey: publishedEvent.pubkey,
              dTag: draftId,
            },
            relayHint,
          })
        }

        // Add subtitle mirrored blobs
        for (const subtitle of subtitles) {
          if (subtitle.mirroredBlobs.length > 0 && subtitle.uploadedBlobs[0]?.sha256) {
            announcements.push({
              blob: {
                type: 'subtitle',
                variant: {
                  url: subtitle.uploadedBlobs[0].url,
                  hash: subtitle.uploadedBlobs[0].sha256,
                  mimeType: 'text/vtt',
                  fallbackUrls: subtitle.mirroredBlobs.map(b => b.url),
                },
                label: `Subtitle (${subtitle.lang})`,
                hash: subtitle.uploadedBlobs[0].sha256,
                ext: 'vtt',
              },
              mirrorResults: subtitle.mirroredBlobs,
              videoEvent: {
                id: publishedEvent.id,
                kind: publishedEvent.kind,
                pubkey: publishedEvent.pubkey,
                dTag: draftId,
              },
              relayHint,
            })
          }
        }

        // Publish 1063 events if we have any announcements
        if (announcements.length > 0 && user) {
          const publishRelays = getMirrorAnnouncementRelays(writeRelays, writeRelays)
          await publishMirrorAnnouncements(
            announcements,
            { signEvent: async eventTemplate => await user.signer.signEvent(eventTemplate) },
            publishRelays
          )
        }
      } catch (err) {
        // Log but don't fail - the video publish already succeeded
        console.warn('[useVideoUpload] Failed to publish 1063 mirror announcements:', err)
      }

      setPublishSummary({
        eventId: publishedEvent.id,
        primaryUrl: primaryVideoUrl,
        fallbackUrls: allFallbackUrls,
      })

      setTitle('')
      setDescription('')
      setFile(null)
      setThumbnail(null)
      setTags([])
      setLanguage('en')

      // Return event info for navigation
      return {
        id: publishedEvent.id,
        kind: publishedEvent.kind,
        pubkey: publishedEvent.pubkey,
        identifier: draftId,
      }
    } catch {
      // Upload failed
      return undefined
    }
  }

  // Sync form field changes back to draft (debounced in useUploadDrafts)
  useEffect(() => {
    if (onDraftChangeRef.current) {
      onDraftChangeRef.current({
        title,
        description,
        tags,
        language,
        people,
        origins,
        inputMethod,
        videoUrl,
        contentWarning: { enabled: contentWarningEnabled, reason: contentWarningReason },
        expiration,
        publishAt,
        thumbnailSource,
        updatedAt: Date.now(),
      })
    }
  }, [
    title,
    description,
    tags,
    language,
    people,
    inputMethod,
    videoUrl,
    contentWarningEnabled,
    contentWarningReason,
    expiration,
    publishAt,
    thumbnailSource,
    origins,
  ])

  // Sync upload milestone changes separately (immediate in useUploadDrafts)
  useEffect(() => {
    if (onDraftChangeRef.current) {
      onDraftChangeRef.current({
        uploadInfo,
        thumbnailUploadInfo: {
          uploadedBlobs: thumbnailUploadInfo.uploadedBlobs,
          mirroredBlobs: thumbnailUploadInfo.mirroredBlobs,
        },
        subtitles,
        updatedAt: Date.now(),
      })
    }
  }, [uploadInfo, thumbnailUploadInfo, subtitles])

  // Build preview event from current form state (reuses buildVideoEvent logic)
  const previewEvent = useMemo(() => {
    if (uploadInfo.videos.length === 0) return null

    // For preview, use existing thumbnail blobs if available, or placeholder
    const thumbUploadedBlobs = thumbnailUploadInfo.uploadedBlobs
    const thumbMirroredBlobs = thumbnailUploadInfo.mirroredBlobs

    const result = buildVideoEvent({
      videos: uploadInfo.videos,
      title: title || '<untitled>',
      description,
      tags,
      language,
      people,
      contentWarningEnabled,
      contentWarningReason,
      expiration,
      thumbnailUploadedBlobs: thumbUploadedBlobs,
      thumbnailMirroredBlobs: thumbMirroredBlobs,
      subtitles,
      draftId,
      thumbnailBlurhash,
      isPreview: true,
      hasPendingThumbnail:
        (thumbnailSource === 'generated' && thumbnailBlob !== null) ||
        (thumbnailSource === 'upload' &&
          thumbnail !== null &&
          thumbnailUploadInfo.uploadedBlobs.length === 0),
      publishAt,
      origins,
    })

    return result.event
  }, [
    uploadInfo.videos,
    title,
    description,
    tags,
    language,
    people,
    contentWarningEnabled,
    contentWarningReason,
    expiration,
    thumbnailSource,
    thumbnailUploadInfo,
    thumbnailBlob,
    thumbnailBlurhash,
    subtitles,
    draftId,
    publishAt,
    origins,
  ])

  return {
    // State
    title,
    setTitle,
    description,
    setDescription,
    tags,
    setTags,
    language,
    setLanguage,
    people,
    setPeople,
    origins,
    setOrigins,
    inputMethod,
    setInputMethod,
    videoUrl,
    setVideoUrl,
    file,
    thumbnail,
    setThumbnail,
    uploadInfo,
    uploadState,
    thumbnailBlob,
    thumbnailSource,
    thumbnailUploadInfo,
    contentWarningEnabled,
    setContentWarningEnabled,
    contentWarningReason,
    setContentWarningReason,
    expiration,
    setExpiration,
    publishAt,
    setPublishAt,
    uploadProgress,
    publishSummary,
    blossomInitalUploadServers,
    blossomMirrorServers,
    isPublishing,
    thumbnailUrl,
    previewEvent,
    videoToDelete,
    setVideoToDelete,
    subtitles,
    subtitleUploading,
    metadataDetected,

    // Handlers
    handleUseRecommendedServers,
    handleUrlVideoProcessing,
    handleThumbnailDrop,
    handleThumbnailSourceChange,
    handleDeleteThumbnail,
    onDrop,
    handleReset,
    handleSubmit,
    handleAddVideo,
    handleRemoveVideo,
    handleRemoveVideoFromFormOnly,
    handleRemoveVideoWithBlobs,
    handleAddTranscodedVideo,
    handleSubtitleDrop,
    handleRemoveSubtitle,
    handleSubtitleLanguageChange,
  }
}

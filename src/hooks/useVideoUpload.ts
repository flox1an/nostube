import { useState, useEffect, useMemo, useRef } from 'react'
import { useCurrentUser, useAppContext, useNostrPublish } from '@/hooks'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { buildAdvancedMimeType, nowInSecs } from '@/lib/utils'
import { presetBlossomServers } from '@/constants/relays'
import { type VideoVariant, processUploadedVideo, processVideoUrl } from '@/lib/video-processing'
import type { UploadDraft } from '@/types/upload-draft'

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
  const [tags, setTags] = useState<string[]>(initialDraft?.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [language, setLanguage] = useState(initialDraft?.language || 'en')
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
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)
  const [publishSummary, setPublishSummary] = useState<PublishSummary>({ fallbackUrls: [] })

  // Use ref to store callback to prevent infinite loop
  const onDraftChangeRef = useRef(onDraftChange)

  // Update ref when callback changes
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange
  }, [onDraftChange])

  const { user } = useCurrentUser()
  const { config, updateConfig } = useAppContext()
  const { publish, isPending: isPublishing } = useNostrPublish()

  const blossomInitalUploadServers = config.blossomServers?.filter(server =>
    server.tags.includes('initial upload')
  )
  const blossomMirrorServers = config.blossomServers?.filter(server =>
    server.tags.includes('mirror')
  )

  const handleUseRecommendedServers = () => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: presetBlossomServers.map(server => ({
        ...server,
        tags: Array.from(new Set([...(server.tags || []), 'initial upload', 'mirror'])),
      })),
    }))
  }

  const addTagsFromInput = (input: string) => {
    const newTags = input
      .split(/\s+/)
      .filter(tag => tag.trim().length > 0)
      .map(tag => tag.trim().replace(/^#/, '').toLowerCase())
    const uniqueNewTags = newTags.filter(tag => !tags.includes(tag))

    if (uniqueNewTags.length > 0) {
      setTags([...tags, ...uniqueNewTags])
    }
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      addTagsFromInput(tagInput)
      setTagInput('')
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text')
    if (pastedText.includes(' ')) {
      e.preventDefault()
      if (tagInput.trim()) {
        addTagsFromInput(tagInput)
      }
      addTagsFromInput(pastedText)
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const parseBlossomUrl = (
    url: string
  ): { isBlossomUrl: boolean; sha256?: string; blossomServer?: string } => {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const match = pathname.match(/\/([a-f0-9]{64})(?:\.[^/]*)?$/i)

      if (match) {
        const sha256 = match[1]
        const blossomServer = `${urlObj.protocol}//${urlObj.host}`
        return {
          isBlossomUrl: true,
          sha256,
          blossomServer,
        }
      }
      return { isBlossomUrl: false }
    } catch {
      return { isBlossomUrl: false }
    }
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

  const currentVideoUrl = useMemo(() => {
    if (uploadInfo.videos.length === 0) return undefined
    const firstVideo = uploadInfo.videos[0]
    if (firstVideo.inputMethod === 'url' && firstVideo.url) {
      return firstVideo.url
    }
    return firstVideo.uploadedBlobs && firstVideo.uploadedBlobs.length > 0
      ? firstVideo.uploadedBlobs[0].url
      : undefined
  }, [uploadInfo.videos])

  useEffect(() => {
    async function createThumbnailFromUrl(videoUrl: string, seekTime = 1): Promise<Blob | null> {
      return new Promise<Blob | null>((resolve, reject) => {
        const video = document.createElement('video')
        video.src = videoUrl
        video.crossOrigin = 'anonymous'
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'

        video.addEventListener(
          'loadedmetadata',
          () => {
            const time = Math.min(seekTime, video.duration - 0.1)
            video.currentTime = time > 0 ? time : 0
          },
          { once: true }
        )

        video.addEventListener(
          'seeked',
          () => {
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8)
          },
          { once: true }
        )

        video.addEventListener(
          'error',
          () => {
            reject(new Error('Failed to load video for thumbnail'))
          },
          { once: true }
        )
      })
    }

    if (currentVideoUrl) {
      createThumbnailFromUrl(currentVideoUrl, 1)
        .then(blob => {
          if (blob) {
            setThumbnailBlob(blob)
          }
          return undefined
        })
        .catch(() => {})
    } else {
      setTimeout(() => setThumbnailBlob(null), 0)
    }
    return undefined
  }, [currentVideoUrl])

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
    setTagInput('')
    setInputMethod('file')
    setVideoUrl('')
    setFile(null)
    setThumbnail(null)
    setUploadInfo({ videos: [] })
    setUploadState('initial')
    setThumbnailBlob(null)
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

  // Handler to remove a video variant
  const handleRemoveVideo = (index: number) => {
    setUploadInfo(ui => ({
      videos: ui.videos.filter((_, i) => i !== index),
    }))
  }

  // Handler to add a transcoded video variant (from DVM)
  const handleAddTranscodedVideo = (transcodedVideo: VideoVariant) => {
    setUploadInfo(ui => ({
      videos: [...ui.videos, transcodedVideo],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setPublishSummary({ fallbackUrls: [] })

    // Validate that we have at least one video
    if (uploadInfo.videos.length === 0) return

    let thumbnailFile: File | null = null
    let thumbnailUploadedBlobs: BlobDescriptor[] = []
    let thumbnailMirroredBlobs: BlobDescriptor[] = []

    if (thumbnailSource === 'generated') {
      if (!thumbnailBlob) return
      thumbnailFile = new File([thumbnailBlob], 'thumbnail.jpg', {
        type: thumbnailBlob.type || 'image/jpeg',
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
    } else {
      if (!thumbnail) return
      thumbnailFile = thumbnail
      thumbnailUploadedBlobs = thumbnailUploadInfo.uploadedBlobs
      thumbnailMirroredBlobs = thumbnailUploadInfo.mirroredBlobs
    }

    if (!thumbnailFile) throw new Error('No valid thumbnail file selected')

    // Calculate expiration timestamp
    const getExpirationTimestamp = (): string | null => {
      if (expiration === 'none') return null

      const now = Math.floor(Date.now() / 1000) // Current time in seconds
      const durations = {
        '1day': 24 * 60 * 60,
        '7days': 7 * 24 * 60 * 60,
        '1month': 30 * 24 * 60 * 60,
        '1year': 365 * 24 * 60 * 60,
      }

      return (now + durations[expiration]).toString()
    }

    try {
      // Determine video kind based on first video's dimensions
      const firstVideo = uploadInfo.videos[0]
      const [width, height] = firstVideo.dimension.split('x').map(Number)
      const kind = height > width ? 22 : 21

      // Create multiple imeta tags - one for each video variant
      const imetaTags: string[][] = []
      const allFallbackUrls: string[] = []

      for (const video of uploadInfo.videos) {
        const imetaTag = ['imeta', `dim ${video.dimension}`]

        // Add primary URL
        const primaryUrl = video.inputMethod === 'url' ? video.url : video.uploadedBlobs[0]?.url
        if (primaryUrl) {
          imetaTag.push(`url ${primaryUrl}`)
        }

        // Add SHA256 hash for uploaded files
        if (video.inputMethod === 'file' && video.uploadedBlobs[0]?.sha256) {
          imetaTag.push(`x ${video.uploadedBlobs[0].sha256}`)
        }

        // Add MIME type with codecs
        if (video.inputMethod === 'file' && video.file) {
          imetaTag.push(
            `m ${buildAdvancedMimeType(video.file.type, video.videoCodec, video.audioCodec)}`
          )
        } else if (video.inputMethod === 'url') {
          imetaTag.push(`m video/mp4`)
        }

        // Add bitrate if available
        if (video.bitrate) {
          imetaTag.push(`bitrate ${video.bitrate}`)
        }

        // Add size if available (in bytes)
        if (video.sizeMB) {
          const sizeBytes = Math.round(video.sizeMB * 1024 * 1024)
          imetaTag.push(`size ${sizeBytes}`)
        }

        // Add thumbnail URLs (shared across all videos)
        thumbnailUploadedBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`))
        thumbnailMirroredBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`))

        // Add fallback URLs from multiple upload servers
        if (video.inputMethod === 'file') {
          if (video.uploadedBlobs.length > 1) {
            for (const blob of video.uploadedBlobs.slice(1)) {
              imetaTag.push(`fallback ${blob.url}`)
              allFallbackUrls.push(blob.url)
            }
          }
          if (video.mirroredBlobs.length > 0) {
            for (const blob of video.mirroredBlobs) {
              imetaTag.push(`fallback ${blob.url}`)
              allFallbackUrls.push(blob.url)
            }
          }
        }

        imetaTags.push(imetaTag)
      }

      const event = {
        kind,
        content: description,
        created_at: nowInSecs(),
        tags: [
          ['title', title],
          ['alt', description],
          ['published_at', nowInSecs().toString()],
          ['duration', firstVideo.duration.toString()],
          ...imetaTags, // Multiple imeta tags, one per video variant
          ...(contentWarningEnabled
            ? [['content-warning', contentWarningReason.trim() ? contentWarningReason : 'NSFW']]
            : []),
          ...(getExpirationTimestamp() ? [['expiration', getExpirationTimestamp()!]] : []),
          ...tags.map(tag => ['t', tag]),
          ['L', 'ISO-639-1'],
          ['l', language, 'ISO-639-1'],
          ['client', 'nostube'],
        ],
      }

      const publishedEvent = await publish({
        event,
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      })

      const primaryVideoUrl =
        firstVideo.inputMethod === 'url' ? firstVideo.url : firstVideo.uploadedBlobs[0]?.url

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
      setTagInput('')
      setLanguage('en')
    } catch {
      // Upload failed
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
        inputMethod,
        videoUrl,
        contentWarning: { enabled: contentWarningEnabled, reason: contentWarningReason },
        expiration,
        thumbnailSource,
        updatedAt: Date.now(),
      })
    }
  }, [
    title,
    description,
    tags,
    language,
    inputMethod,
    videoUrl,
    contentWarningEnabled,
    contentWarningReason,
    expiration,
    thumbnailSource,
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
        updatedAt: Date.now(),
      })
    }
  }, [uploadInfo, thumbnailUploadInfo])

  return {
    // State
    title,
    setTitle,
    description,
    setDescription,
    tags,
    tagInput,
    setTagInput,
    language,
    setLanguage,
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
    uploadProgress,
    publishSummary,
    blossomInitalUploadServers,
    blossomMirrorServers,
    isPublishing,
    thumbnailUrl,

    // Handlers
    handleUseRecommendedServers,
    handleAddTag,
    handlePaste,
    removeTag,
    handleUrlVideoProcessing,
    handleThumbnailDrop,
    handleThumbnailSourceChange,
    onDrop,
    handleReset,
    handleSubmit,
    handleAddVideo,
    handleRemoveVideo,
    handleAddTranscodedVideo,
  }
}

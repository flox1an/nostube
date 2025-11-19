import { useState, useEffect, useMemo } from 'react'
import { useCurrentUser, useAppContext, useNostrPublish } from '@/hooks'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { buildAdvancedMimeType, nowInSecs } from '@/lib/utils'
import { getCodecsFromFile, getCodecsFromUrl, type CodecInfo } from '@/lib/codec-detection'
import { presetBlossomServers } from '@/constants/relays'

export interface UploadInfo {
  dimension?: string
  sizeMB?: number
  duration?: number
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
  videoCodec?: string
  audioCodec?: string
  bitrate?: number
  videoUrl?: string
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

export function useVideoUpload() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [language, setLanguage] = useState('en')
  const [inputMethod, setInputMethod] = useState<'file' | 'url'>('file')
  const [videoUrl, setVideoUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [uploadInfo, setUploadInfo] = useState<UploadInfo>({ uploadedBlobs: [], mirroredBlobs: [] })
  const [uploadState, setUploadState] = useState<'initial' | 'uploading' | 'finished'>('initial')
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null)
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>('generated')
  const [thumbnailUploadInfo, setThumbnailUploadInfo] = useState<ThumbnailUploadInfo>({
    uploadedBlobs: [],
    mirroredBlobs: [],
    uploading: false,
  })
  const [contentWarningEnabled, setContentWarningEnabled] = useState(false)
  const [contentWarningReason, setContentWarningReason] = useState('')
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)
  const [publishSummary, setPublishSummary] = useState<PublishSummary>({ fallbackUrls: [] })

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

    setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
    setUploadState('uploading')

    try {
      const video = document.createElement('video')
      video.src = url
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve
        video.onerror = () => reject(new Error('Failed to load video from URL'))
        setTimeout(() => reject(new Error('Video loading timeout')), 10000)
      })

      const duration = Math.round(video.duration)
      const dimensions = `${video.videoWidth}x${video.videoHeight}`
      const codecs = await getCodecsFromUrl(url)
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

      setUploadInfo({
        dimension: dimensions,
        duration,
        uploadedBlobs: [],
        mirroredBlobs,
        videoUrl: url,
        videoCodec: codecs.videoCodec,
        audioCodec: codecs.audioCodec,
        bitrate: Math.floor(codecs.bitrate || 0),
      })

      setUploadState('finished')
    } catch (error) {
      console.error('Failed to process video URL:', error)
      setUploadState('initial')
      setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
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
      setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
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

        const video = document.createElement('video')
        video.src = URL.createObjectURL(acceptedFiles[0])
        await new Promise(resolve => {
          video.onloadedmetadata = resolve
        })
        const duration = Math.round(video.duration)
        const dimensions = `${video.videoWidth}x${video.videoHeight}`
        const sizeMB = acceptedFiles[0].size / 1024 / 1024

        let codecs: CodecInfo = {}
        try {
          codecs = await getCodecsFromFile(acceptedFiles[0])
        } catch {
          codecs = {}
        }

        setUploadInfo({
          dimension: dimensions,
          sizeMB: Number(sizeMB.toFixed(2)),
          duration,
          uploadedBlobs: uploadedBlobs,
          mirroredBlobs: [],
          videoCodec: codecs.videoCodec,
          audioCodec: codecs.audioCodec,
          bitrate: Math.floor(codecs.bitrate || 0),
        })

        if (blossomMirrorServers && blossomMirrorServers.length > 0) {
          const mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: uploadedBlobs[0],
            signer: async draft => await user.signer.signEvent(draft),
          })
          setUploadInfo(ui => ({
            ...ui,
            mirroredBlobs,
          }))
        }
      } catch (error) {
        console.error('BUD-10 upload failed:', error)
        setUploadState('initial')
        setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
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
    if (inputMethod === 'url' && uploadInfo.videoUrl) {
      return uploadInfo.videoUrl
    }
    return uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0
      ? uploadInfo.uploadedBlobs[0].url
      : undefined
  }, [inputMethod, uploadInfo.videoUrl, uploadInfo.uploadedBlobs])

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
    setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
    setUploadState('initial')
    setThumbnailBlob(null)
    setThumbnailSource('generated')
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: false })
    setUploadProgress(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setPublishSummary({ fallbackUrls: [] })

    if (inputMethod === 'file' && (!file || !blossomInitalUploadServers)) return
    if (inputMethod === 'url' && !videoUrl) return

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

    if (inputMethod === 'file' && (!file || !(file instanceof File)))
      throw new Error('No valid video file selected')
    if (inputMethod === 'url' && !uploadInfo.videoUrl)
      throw new Error('No valid video URL provided')
    if (!thumbnailFile) throw new Error('No valid thumbnail file selected')

    try {
      const [width, height] = uploadInfo.dimension?.split('x').map(Number) || [0, 0]
      const kind = height > width ? 22 : 21

      const videoUrl =
        inputMethod === 'url' ? uploadInfo.videoUrl : uploadInfo.uploadedBlobs?.[0].url
      const imetaTag = ['imeta', `dim ${uploadInfo.dimension}`, `url ${videoUrl}`]
      const fallbackUrls: string[] = []

      if (inputMethod === 'file' && uploadInfo.uploadedBlobs?.[0]) {
        imetaTag.push(`x ${uploadInfo.uploadedBlobs[0].sha256}`)
        imetaTag.push(
          `m ${buildAdvancedMimeType(file!.type, uploadInfo.videoCodec, uploadInfo.audioCodec)}`
        )
      } else if (inputMethod === 'url') {
        imetaTag.push(`m video/mp4`)
      }

      if (uploadInfo.bitrate) {
        imetaTag.push(`bitrate ${uploadInfo.bitrate}`)
      }

      thumbnailUploadedBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`))
      thumbnailMirroredBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`))

      if (inputMethod === 'file') {
        if (uploadInfo.uploadedBlobs.length > 1) {
          for (const blob of uploadInfo.uploadedBlobs.slice(1)) {
            imetaTag.push(`fallback ${blob.url}`)
            fallbackUrls.push(blob.url)
          }
        }
        if (uploadInfo.mirroredBlobs.length > 0) {
          for (const blob of uploadInfo.mirroredBlobs) {
            imetaTag.push(`fallback ${blob.url}`)
            fallbackUrls.push(blob.url)
          }
        }
      }

      const event = {
        kind,
        content: description,
        created_at: nowInSecs(),
        tags: [
          ['title', title],
          ['alt', description],
          ['published_at', nowInSecs().toString()],
          ['duration', uploadInfo.duration?.toString() || '0'],
          imetaTag,
          ...(contentWarningEnabled
            ? [['content-warning', contentWarningReason.trim() ? contentWarningReason : 'NSFW']]
            : []),
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
      setPublishSummary({
        eventId: publishedEvent.id,
        primaryUrl: videoUrl,
        fallbackUrls,
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
  }
}

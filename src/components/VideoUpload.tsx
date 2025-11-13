import { useState, useEffect, useMemo } from 'react'
import { useCurrentUser, useAppContext, useNostrPublish } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Loader2, Trash } from 'lucide-react'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { BlobDescriptor } from 'blossom-client-sdk'
import { useNavigate } from 'react-router-dom'
import { buildAdvancedMimeType, nowInSecs } from '@/lib/utils'
import { getCodecsFromFile, getCodecsFromUrl, type CodecInfo } from '@/lib/codec-detection'
import { UploadServer } from './UploadServer'
import {
  InputMethodSelector,
  UrlInputSection,
  FileDropzone,
  VideoPreview,
  FormFields,
  ContentWarning,
  ThumbnailSection,
} from './video-upload'

export function VideoUpload() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [language, setLanguage] = useState('en')
  const [inputMethod, setInputMethod] = useState<'file' | 'url'>('file')
  const [videoUrl, setVideoUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [uploadInfo, setUploadInfo] = useState<{
    dimension?: string
    sizeMB?: number
    duration?: number
    uploadedBlobs: BlobDescriptor[]
    mirroredBlobs: BlobDescriptor[]
    videoCodec?: string
    audioCodec?: string
    bitrate?: number // Total bitrate in bits per second (video + audio)
    videoUrl?: string // For URL-based videos
  }>({ uploadedBlobs: [], mirroredBlobs: [] })
  const [uploadState, setUploadState] = useState<'initial' | 'uploading' | 'finished'>('initial')
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null)
  const [thumbnailSource, setThumbnailSource] = useState<'generated' | 'upload'>('generated')
  const [thumbnailUploadInfo, setThumbnailUploadInfo] = useState<{
    uploadedBlobs: BlobDescriptor[]
    mirroredBlobs: BlobDescriptor[]
    uploading: boolean
    error?: string
  }>({ uploadedBlobs: [], mirroredBlobs: [], uploading: false })
  const [contentWarningEnabled, setContentWarningEnabled] = useState(false)
  const [contentWarningReason, setContentWarningReason] = useState('')
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null)

  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const { publish } = useNostrPublish()
  const blossomInitalUploadServers = config.blossomServers?.filter(server =>
    server.tags.includes('initial upload')
  )
  const blossomMirrorServers = config.blossomServers?.filter(server =>
    server.tags.includes('mirror')
  )
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    // Check if we have either a file or URL
    if (inputMethod === 'file' && (!file || !blossomInitalUploadServers)) return
    if (inputMethod === 'url' && !videoUrl) return

    // Determine which thumbnail to use and upload if needed
    let thumbnailFile: File | null = null
    let thumbnailUploadedBlobs: BlobDescriptor[] = []
    let thumbnailMirroredBlobs: BlobDescriptor[] = []

    if (thumbnailSource === 'generated') {
      if (!thumbnailBlob) return
      // Convert Blob to File for upload
      thumbnailFile = new File([thumbnailBlob], 'thumbnail.jpg', {
        type: thumbnailBlob.type || 'image/jpeg',
        lastModified: Date.now(),
      })

      // Upload generated thumbnail to Blossom servers
      try {
        thumbnailUploadedBlobs = await uploadFileToMultipleServers({
          file: thumbnailFile,
          servers: blossomInitalUploadServers!.map(server => server.url),
          signer: async draft => await user.signer.signEvent(draft),
        })

        // Mirror to mirror servers
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
      // Use already uploaded thumbnail blobs
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

      // Publish Nostr event (NIP-71)
      const videoUrl =
        inputMethod === 'url' ? uploadInfo.videoUrl : uploadInfo.uploadedBlobs?.[0].url
      const imetaTag = ['imeta', `dim ${uploadInfo.dimension}`, `url ${videoUrl}`]

      // Add hash and mime type for uploaded files
      if (inputMethod === 'file' && uploadInfo.uploadedBlobs?.[0]) {
        imetaTag.push(`x ${uploadInfo.uploadedBlobs[0].sha256}`)
        imetaTag.push(
          `m ${buildAdvancedMimeType(file!.type, uploadInfo.videoCodec, uploadInfo.audioCodec)}`
        )
      } else if (inputMethod === 'url') {
        // For URL videos, we can't determine exact mime type without the file
        imetaTag.push(`m video/mp4`)
      }

      // Add bitrate if available (in bits per second)
      if (uploadInfo.bitrate) {
        imetaTag.push(`bitrate ${uploadInfo.bitrate}`)
      }

      thumbnailUploadedBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`))
      thumbnailMirroredBlobs.forEach(blob => imetaTag.push(`image ${blob.url}`))

      // Only add fallback URLs for uploaded files
      if (inputMethod === 'file') {
        if (uploadInfo.uploadedBlobs.length > 1) {
          for (const blob of uploadInfo.uploadedBlobs.slice(1)) {
            imetaTag.push(`fallback ${blob.url}`)
          }
        }
        if (uploadInfo.mirroredBlobs.length > 0) {
          for (const blob of uploadInfo.mirroredBlobs) {
            imetaTag.push(`fallback ${blob.url}`)
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

      /*
          ["text-track", "<encoded `kind 6000` event>", "<recommended relay urls>"],
          ["segment", <start>, <end>, "<title>", "<thumbnail URL>"],

    // participants
    ["p", "<32-bytes hex of a pubkey>", "<optional recommended relay URL>"],
    ["p", "<32-bytes hex of a pubkey>", "<optional recommended relay URL>"],

    // hashtags
    ["t", "<tag>"],
    ["t", "<tag>"],

    // reference links
    ["r", "<url>"],
    ["r", "<url>"]
    */

      await publish({
        event,
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      })

      // Navigate to home or videos page since we don't have the event ID yet
      navigate('/')

      // Reset form
      setTitle('')
      setDescription('')
      setFile(null)
      setThumbnail(null)
      setTags([])
      setTagInput('')
      setLanguage('en')
    } catch {
      // Upload failed - error state is handled by uploadState
    }
  }

  const addTagsFromInput = (input: string) => {
    // Split by spaces and filter out empty strings
    const newTags = input.split(/\s+/).filter(tag => tag.trim().length > 0)
    const uniqueNewTags = newTags.filter(tag => !tags.includes(tag.trim()))

    if (uniqueNewTags.length > 0) {
      setTags([...tags, ...uniqueNewTags.map(tag => tag.trim())])
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

    // Check if the pasted text contains spaces (likely multiple tags)
    if (pastedText.includes(' ')) {
      e.preventDefault()

      // Add any existing input as a tag first
      if (tagInput.trim()) {
        addTagsFromInput(tagInput)
      }

      // Add the pasted tags
      addTagsFromInput(pastedText)
      setTagInput('')
    }
    // If no spaces, let the default paste behavior handle it
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  // Check if URL is a Blossom URL and extract SHA256 hash
  const parseBlossomUrl = (
    url: string
  ): { isBlossomUrl: boolean; sha256?: string; blossomServer?: string } => {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname

      // Blossom URLs typically have the format: https://server.com/{sha256}.{extension}
      // SHA256 hashes are 64 characters long (hex)
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

  // Handle URL video processing
  const handleUrlVideoProcessing = async (url: string) => {
    if (!url) return

    setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
    setUploadState('uploading')

    try {
      // Create a video element to extract metadata
      const video = document.createElement('video')
      video.src = url
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.playsInline = true
      video.preload = 'metadata'

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve
        video.onerror = () => reject(new Error('Failed to load video from URL'))

        // Set a timeout in case the video doesn't load
        setTimeout(() => reject(new Error('Video loading timeout')), 10000)
      })

      const duration = Math.round(video.duration)
      const dimensions = `${video.videoWidth}x${video.videoHeight}`

      // Try to extract codec information
      const codecs = await getCodecsFromUrl(url)

      // Check if this is a Blossom URL and handle mirroring
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
          // Create a BlobDescriptor for the Blossom URL
          const originalBlob: BlobDescriptor = {
            url: url,
            sha256: blossomInfo.sha256,
            size: 0, // Size unknown for URL-based videos
            type: 'video/mp4', // Assume MP4 for now
            uploaded: Date.now(),
          }

          // Mirror to configured mirror servers
          mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: originalBlob,
            signer: async draft => await user.signer.signEvent(draft),
          })

          if (import.meta.env.DEV)
            console.log(`Mirrored Blossom URL to ${mirroredBlobs.length} servers`)
        } catch (error) {
          console.error('Failed to mirror Blossom URL:', error)
          // Continue without mirroring - not a critical failure
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
        bitrate: codecs.bitrate,
      })

      setUploadState('finished')
    } catch (error) {
      console.error('Failed to process video URL:', error)
      setUploadState('initial')
      setUploadInfo({ uploadedBlobs: [], mirroredBlobs: [] })
      // Could show error toast here
    }
  }

  // Thumbnail dropzone logic
  const handleThumbnailDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles[0] || !blossomInitalUploadServers || !user) return
    setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: true })
    try {
      // Upload to initial servers
      const uploadedBlobs = await uploadFileToMultipleServersChunked({
        file: acceptedFiles[0],
        servers: blossomInitalUploadServers.map(server => server.url),
        signer: async draft => await user.signer.signEvent(draft),
      })
      // Mirror to mirror servers
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
      setThumbnail(null) // clear uploaded file if switching to generated
    }
  }

  // Dropzone for video file
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

      // Start upload automatically
      try {
        setUploadProgress({
          uploadedBytes: 0,
          totalBytes: acceptedFiles[0].size,
          percentage: 0,
          currentChunk: 0,
          totalChunks: 1,
        })
        // Use BUD-10 compliant chunked upload (PATCH-only, no PUT fallback)
        const uploadedBlobs = await uploadFileToMultipleServersChunked({
          file: acceptedFiles[0],
          servers: blossomInitalUploadServers.map(server => server.url),
          signer: async draft => await user.signer.signEvent(draft),
          options: {
            chunkSize: 10 * 1024 * 1024, // 10MB chunks
            maxConcurrentChunks: 2, // 2 concurrent chunks
          },
          callbacks: {
            onProgress: progress => {
              setUploadProgress(progress)
            },
            onChunkComplete: (chunkIndex, totalChunks) => {
              if (import.meta.env.DEV) {
                console.log(`BUD-10 PATCH chunk ${chunkIndex + 1}/${totalChunks} completed`)
              }
            },
          },
        })

        // Calculate video duration and dimensions
        const video = document.createElement('video')
        video.src = URL.createObjectURL(acceptedFiles[0])
        await new Promise(resolve => {
          video.onloadedmetadata = resolve
        })
        const duration = Math.round(video.duration)
        const dimensions = `${video.videoWidth}x${video.videoHeight}`
        const sizeMB = acceptedFiles[0].size / 1024 / 1024

        // Extract codec info using MP4Box.js
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
          bitrate: codecs.bitrate,
        })

        if (blossomMirrorServers && blossomMirrorServers.length > 0) {
          const mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers: blossomMirrorServers.map(s => s.url),
            blob: uploadedBlobs[0], // TODO which blob to mirror?
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

        // Show BUD-10 specific error messages
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

  // Memoize the video URL for thumbnail generation (works for both uploaded files and URLs)
  const currentVideoUrl = useMemo(() => {
    if (inputMethod === 'url' && uploadInfo.videoUrl) {
      return uploadInfo.videoUrl
    }
    return uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0
      ? uploadInfo.uploadedBlobs[0].url
      : undefined
  }, [inputMethod, uploadInfo.videoUrl, uploadInfo.uploadedBlobs])

  // Generate thumbnail from video after upload using a headless video element
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
            // Clamp seekTime to video duration
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
      // Clear thumbnail when no video URL
      setTimeout(() => setThumbnailBlob(null), 0)
    }
    // No cleanup needed, so return void
    return undefined
  }, [currentVideoUrl])

  // Memoize the thumbnail URL and clean up when thumbnailBlob changes
  const thumbnailUrl = useMemo(() => {
    if (!thumbnailBlob) return undefined
    // TypeScript: thumbnailBlob is Blob, not null
    return URL.createObjectURL(thumbnailBlob as Blob)
  }, [thumbnailBlob])

  useEffect(() => {
    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl)
      }
    }
  }, [thumbnailUrl])

  // Reset all form fields and state
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

  if (!user) {
    return <div>Please log in to upload videos</div>
  }

  return (
    <Card>
      {/* Info bar above drop zone */}
      <div className="flex items-center justify-between bg-muted border border-muted-foreground/10 rounded px-4 py-2 mb-4">
        <div className="text-sm text-muted-foreground">
          Uploading directly to{' '}
          <b className="text-foreground">{blossomInitalUploadServers?.length ?? 0}</b> server
          {(blossomInitalUploadServers?.length ?? 0) === 1 ? '' : 's'}. Mirroring to{' '}
          <b className="text-foreground">{blossomMirrorServers?.length ?? 0}</b> server
          {(blossomMirrorServers?.length ?? 0) === 1 ? '' : 's'}.
        </div>
        <Button
          onClick={() => navigate('/settings')}
          variant={'outline'}
          className=" cursor-pointer"
        >
          Configure servers
        </Button>
      </div>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          {/* Input method selection - hide after processing */}
          {uploadState === 'initial' && (
            <InputMethodSelector value={inputMethod} onChange={setInputMethod} />
          )}

          {/* URL input field - hide after processing */}
          {inputMethod === 'url' && uploadState !== 'finished' && (
            <UrlInputSection
              videoUrl={videoUrl}
              onVideoUrlChange={setVideoUrl}
              onProcess={() => handleUrlVideoProcessing(videoUrl)}
              isProcessing={uploadState === 'uploading'}
            />
          )}

          {/* Video preview or dropzone */}
          {(uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0) ||
          (inputMethod === 'url' && uploadInfo.videoUrl) ? (
            <VideoPreview
              inputMethod={inputMethod}
              uploadedBlobs={uploadInfo.uploadedBlobs}
              videoUrl={uploadInfo.videoUrl}
              dimension={uploadInfo.dimension}
              sizeMB={uploadInfo.sizeMB}
              duration={uploadInfo.duration}
              videoCodec={uploadInfo.videoCodec}
              audioCodec={uploadInfo.audioCodec}
            />
          ) : inputMethod === 'file' &&
            blossomInitalUploadServers &&
            blossomInitalUploadServers.length > 0 ? (
            <FileDropzone
              onDrop={onDrop}
              accept={{ 'video/*': [] }}
              selectedFile={file}
              className="mb-4"
              style={{
                display:
                  uploadInfo.uploadedBlobs && uploadInfo.uploadedBlobs.length > 0
                    ? 'none'
                    : undefined,
              }}
            />
          ) : inputMethod === 'file' ? (
            <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
              <span>
                You do not have any Blossom server tagged with <b>"initial upload"</b>.<br />
                Please go to{' '}
                <a href="/settings" className="underline text-blue-600">
                  Settings
                </a>{' '}
                and assign the <b>"initial upload"</b> tag to at least one server.
              </span>
            </div>
          ) : null}

          {/* Server upload/mirror status */}
          <UploadServer
            inputMethod={inputMethod}
            uploadState={uploadState}
            uploadedBlobs={uploadInfo.uploadedBlobs}
            mirroredBlobs={uploadInfo.mirroredBlobs}
            hasInitialUploadServers={
              !!(blossomInitalUploadServers && blossomInitalUploadServers.length > 0)
            }
          />

          {/* Upload progress indicator */}
          {uploadProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin h-5 w-5 text-primary" />
                  <span>Uploading video...</span>
                </div>
                <span>{uploadProgress.percentage}%</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percentage}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">
                Chunk {uploadProgress.currentChunk} of {uploadProgress.totalChunks}&nbsp;•&nbsp;
                {Math.round(uploadProgress.uploadedBytes / 1024 / 1024)}MB /{' '}
                {Math.round(uploadProgress.totalBytes / 1024 / 1024)}MB
                {uploadProgress.speedMBps !== undefined && (
                  <> • {uploadProgress.speedMBps.toFixed(1)} MB/s</>
                )}
              </div>
            </div>
          )}

          {/* Show form fields only after upload has started */}
          {uploadState !== 'initial' && (
            <>
              <FormFields
                title={title}
                onTitleChange={setTitle}
                description={description}
                onDescriptionChange={setDescription}
                tags={tags}
                tagInput={tagInput}
                onTagInputChange={setTagInput}
                onAddTag={handleAddTag}
                onPaste={handlePaste}
                onRemoveTag={removeTag}
                onTagInputBlur={() => {
                  if (tagInput.trim()) {
                    addTagsFromInput(tagInput)
                    setTagInput('')
                  }
                }}
                language={language}
                onLanguageChange={setLanguage}
              />

              <ThumbnailSection
                thumbnailSource={thumbnailSource}
                onThumbnailSourceChange={handleThumbnailSourceChange}
                thumbnailBlob={thumbnailBlob}
                thumbnailUrl={thumbnailUrl}
                onThumbnailDrop={handleThumbnailDrop}
                isThumbDragActive={false}
                thumbnailUploadInfo={thumbnailUploadInfo}
              />

              <ContentWarning
                enabled={contentWarningEnabled}
                reason={contentWarningReason}
                onEnabledChange={setContentWarningEnabled}
                onReasonChange={setContentWarningReason}
              />
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            title="Reset form"
            aria-label="Reset form"
          >
            <Trash className="w-5 h-5" />
          </Button>
          <Button
            type="submit"
            disabled={
              (inputMethod === 'file' &&
                (!uploadInfo.uploadedBlobs || uploadInfo.uploadedBlobs.length === 0)) ||
              (inputMethod === 'url' && !uploadInfo.videoUrl) ||
              !title ||
              !thumbnailSource ||
              (thumbnailSource === 'generated' && !thumbnailBlob) ||
              (thumbnailSource === 'upload' &&
                (!thumbnailUploadInfo.uploadedBlobs ||
                  thumbnailUploadInfo.uploadedBlobs.length === 0))
            }
          >
            Publish video
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

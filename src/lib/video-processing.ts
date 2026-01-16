import { type BlobDescriptor } from 'blossom-client-sdk'
import { getCodecsFromFile, getCodecsFromUrl } from './codec-detection'

/**
 * Interface representing a single video variant (e.g., different quality levels)
 */
export interface VideoVariant {
  url?: string // The video URL (from upload or URL input)
  dimension: string // e.g., "1920x1080"
  sizeMB?: number // File size in MB (only for uploaded files)
  duration: number // Duration in seconds
  videoCodec?: string // e.g., "avc1.64001F"
  audioCodec?: string // e.g., "mp4a.40.2"
  bitrate?: number // Total bitrate
  uploadedBlobs: BlobDescriptor[] // Blobs from initial upload servers
  mirroredBlobs: BlobDescriptor[] // Blobs from mirror servers
  inputMethod: 'file' | 'url' // How this video was added
  file?: File // Original file (only for uploaded files)
  qualityLabel?: string // e.g., "1080p", "720p", "480p"
}

/**
 * Generate a quality label from video dimensions
 * e.g., "1920x1080" -> "1080p"
 */
export function generateQualityLabel(dimension: string): string {
  const [width, height] = dimension.split('x').map(Number)
  // Use the shorter dimension (height for landscape, width for portrait)
  // as that's what the "p" value represents (e.g., 720p = 720 vertical lines)
  const resolution = Math.min(width, height)

  if (resolution >= 3840) return '4K'
  if (resolution >= 2560) return '2K'
  if (resolution >= 1920) return '1080p'
  if (resolution >= 1280) return '720p'
  if (resolution >= 854) return '480p'
  if (resolution >= 640) return '360p'
  return `${resolution}p`
}

/**
 * Extract video metadata from a video element
 */
export async function extractVideoMetadata(
  videoElement: HTMLVideoElement
): Promise<{ dimension: string; duration: number }> {
  await new Promise((resolve, reject) => {
    videoElement.onloadedmetadata = resolve
    videoElement.onerror = () => reject(new Error('Failed to load video metadata'))
    setTimeout(() => reject(new Error('Video loading timeout')), 10000)
  })

  const duration = Math.round(videoElement.duration)
  const dimension = `${videoElement.videoWidth}x${videoElement.videoHeight}`

  return { dimension, duration }
}

/**
 * Process uploaded video file and extract all metadata
 */
export async function processUploadedVideo(
  file: File,
  uploadedBlobs: BlobDescriptor[]
): Promise<VideoVariant> {
  const video = document.createElement('video')
  video.src = URL.createObjectURL(file)
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'

  try {
    const { dimension, duration } = await extractVideoMetadata(video)
    const sizeMB = file.size / 1024 / 1024
    const qualityLabel = generateQualityLabel(dimension)

    let videoCodec: string | undefined
    let audioCodec: string | undefined
    let bitrate: number | undefined

    try {
      const codecs = await getCodecsFromFile(file)
      videoCodec = codecs.videoCodec
      audioCodec = codecs.audioCodec
      bitrate = codecs.bitrate
    } catch (error) {
      console.warn('Failed to extract codecs from file:', error)
    }

    return {
      url: uploadedBlobs[0]?.url,
      dimension,
      sizeMB: Number(sizeMB.toFixed(2)),
      duration,
      videoCodec,
      audioCodec,
      bitrate: bitrate ? Math.floor(bitrate) : undefined,
      uploadedBlobs,
      mirroredBlobs: [],
      inputMethod: 'file',
      file,
      qualityLabel,
    }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}

/**
 * Fetch file size from URL using HEAD request
 */
async function fetchFileSizeFromUrl(url: string): Promise<number | undefined> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentLength = response.headers.get('Content-Length')
    if (contentLength) {
      const bytes = parseInt(contentLength, 10)
      if (!isNaN(bytes) && bytes > 0) {
        return bytes
      }
    }
  } catch (error) {
    console.warn('Failed to fetch file size from URL:', error)
  }
  return undefined
}

/**
 * Process video URL and extract metadata
 */
export async function processVideoUrl(
  url: string,
  mirroredBlobs: BlobDescriptor[] = []
): Promise<VideoVariant> {
  const video = document.createElement('video')
  video.src = url
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'

  const [{ dimension, duration }, fileSize] = await Promise.all([
    extractVideoMetadata(video),
    fetchFileSizeFromUrl(url),
  ])
  const qualityLabel = generateQualityLabel(dimension)
  const sizeMB = fileSize ? Number((fileSize / 1024 / 1024).toFixed(2)) : undefined

  let videoCodec: string | undefined
  let audioCodec: string | undefined
  let bitrate: number | undefined

  try {
    const codecs = await getCodecsFromUrl(url)
    videoCodec = codecs.videoCodec
    audioCodec = codecs.audioCodec
    bitrate = codecs.bitrate
  } catch (error) {
    console.warn('Failed to extract codecs from URL:', error)
  }

  return {
    url,
    dimension,
    sizeMB,
    duration,
    videoCodec,
    audioCodec,
    bitrate: bitrate ? Math.floor(bitrate) : undefined,
    uploadedBlobs: [],
    mirroredBlobs,
    inputMethod: 'url',
    qualityLabel,
  }
}

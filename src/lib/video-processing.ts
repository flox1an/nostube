import { type BlobDescriptor } from '@/lib/blossom-auth'
import { getCodecsFromFile, getCodecsFromUrl, type CodecInfo } from './codec-detection'
import { extractMetadataFromFile, extractMetadataFromUrl } from './metadata-extraction'
import type { VideoMetadata } from './metadata-extraction'
import type { OriginalVideoInfo } from '@/types/upload-draft'

/**
 * The publishable placement of one media Blob.
 *
 * Fallback Blobs must contain the same SHA256 as the primary Blob. A direct URL is
 * retained only after every verified Blob location has been tried.
 */
export interface BlobPlacement {
  primaryBlob?: BlobDescriptor
  fallbackBlobs: BlobDescriptor[]
  directUrl?: string
}

export interface BlobPlacementOptions {
  primaryBlob?: BlobDescriptor
  candidateBlobs?: BlobDescriptor[]
  directUrl?: string
}

export function createBlobPlacement({
  primaryBlob,
  candidateBlobs = [],
  directUrl,
}: BlobPlacementOptions): BlobPlacement {
  const primary = primaryBlob ?? candidateBlobs[0]
  const fallbackBlobs = primary
    ? candidateBlobs.filter(blob => blob.sha256 === primary.sha256 && blob.url !== primary.url)
    : []
  const uniqueFallbackBlobs = Array.from(
    new Map(fallbackBlobs.map(blob => [blob.url, blob])).values()
  )

  return {
    primaryBlob: primary,
    fallbackBlobs: uniqueFallbackBlobs,
    ...(directUrl && directUrl !== primary?.url ? { directUrl } : {}),
  }
}

/**
 * Adapts a persisted VideoVariant from before Blob Placement was explicit.
 * This is intentionally pure; Draft persistence writes the normalized value only
 * during a later Draft update.
 */
export function normalizeVideoVariantPlacement(variant: VideoVariant): VideoVariant {
  if (variant.placement) return variant

  const candidateBlobs = [...(variant.uploadedBlobs ?? []), ...(variant.mirroredBlobs ?? [])]
  const primaryBlob = candidateBlobs.find(blob => blob.url === variant.url) ?? candidateBlobs[0]

  return {
    ...variant,
    placement: createBlobPlacement({
      primaryBlob,
      candidateBlobs,
      directUrl: variant.url,
    }),
  }
}
/**
 * Interface representing a single video variant (e.g., different quality levels)
 */
export interface VideoVariant {
  url?: string // The video URL (from upload or URL input)
  mimeType?: string // The video MIME type (e.g., "video/mp4", "application/vnd.apple.mpegurl")
  dimension: string // e.g., "1920x1080"
  sizeMB?: number // File size in MB (only for uploaded files)
  duration: number // Duration in seconds
  videoCodec?: string // e.g., "avc1.64001F"
  audioCodec?: string // e.g., "mp4a.40.2"
  bitrate?: number // Total bitrate
  uploadedBlobs: BlobDescriptor[] // Blobs from initial upload servers and HLS asset lifecycle
  mirroredBlobs: BlobDescriptor[] // Blobs from mirror servers and HLS asset lifecycle
  placement: BlobPlacement // Publishable Blob location; independent of acquisition provenance
  inputMethod: 'file' | 'url' // How this video was added
  file?: File // Original file (only for uploaded files)
  qualityLabel?: string // e.g., "1080p", "720p", "480p"
  hlsVariants?: HlsVariantStream[] // Per-stream info for HLS master playlists
  extractedMetadata?: VideoMetadata // iTunes metadata from moov/udta/meta/ilst
}

export interface HlsVariantStream {
  type?: 'video' | 'audio' // defaults to 'video' when absent
  language?: string // ISO 639-1 language code, set for audio renditions
  url: string // Variant/rendition playlist URL (.m3u8)
  dimension: string // e.g., "1280x720"; '-' for audio-only renditions
  qualityLabel: string // e.g., "720p"; language name for audio renditions
  sizeMB?: number // Total generated stream size in MB
  mimeType?: string // e.g., application/vnd.apple.mpegurl; codecs="avc1.64001f,mp4a.40.2"
  videoCodec?: string // e.g., "avc1.64001F" or "hvc1.1.6.L123.B0"
  audioCodec?: string // e.g., "mp4a.40.2"
}

/**
 * Generate a quality label from video dimensions
 * e.g., "1920x1080" -> "1080p"
 */
export function generateQualityLabel(dimension: string): string {
  const [width, height] = dimension.split('x').map(Number)
  // Use the shorter dimension (height for landscape, width for portrait)
  // as that's what the "p" value represents (e.g., 720p = 720 vertical lines)
  const shorter = Math.min(width, height)
  const longer = Math.max(width, height)

  // For 4K/2K, also check the longer dimension to handle non-standard aspect ratios
  // e.g., 3840x2124 should be 4K even though 2124 < 2160
  if (shorter >= 2160 || longer >= 3840) return '4K'
  if (shorter >= 1440 || longer >= 2560) return '2K'
  if (shorter >= 1080) return '1080p'
  if (shorter >= 720) return '720p'
  if (shorter >= 480) return '480p'
  if (shorter >= 360) return '360p'
  if (shorter >= 240) return '240p'
  return `${shorter}p`
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

    let extractedMetadata: VideoMetadata | undefined

    // Extract codecs and metadata in parallel
    const [codecs, metadata] = await Promise.all([
      getCodecsFromFile(file).catch(err => {
        console.warn('Failed to extract codecs from file:', err)
        return {} as CodecInfo
      }),
      extractMetadataFromFile(file).catch(err => {
        console.warn('Failed to extract metadata from file:', err)
        return {} as VideoMetadata
      }),
    ])

    const videoCodec = codecs.videoCodec
    const audioCodec = codecs.audioCodec
    const bitrate = codecs.bitrate

    // Only include metadata if we found something
    if (Object.keys(metadata).length > 0) {
      extractedMetadata = metadata
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
      placement: createBlobPlacement({
        primaryBlob: uploadedBlobs[0],
        candidateBlobs: uploadedBlobs,
      }),
      inputMethod: 'file',
      file,
      qualityLabel,
      extractedMetadata,
    }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}

/**
 * Extract serializable metadata from the original local video before it is discarded
 * by the browser transcode workflow.
 */
export async function processOriginalVideoInfo(file: File): Promise<OriginalVideoInfo> {
  const video = document.createElement('video')
  video.src = URL.createObjectURL(file)
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'

  try {
    const { dimension, duration } = await extractVideoMetadata(video)
    const sizeMB = file.size / 1024 / 1024
    const qualityLabel = generateQualityLabel(dimension)

    const [codecs, metadata] = await Promise.all([
      getCodecsFromFile(file).catch(err => {
        console.warn('Failed to extract codecs from original file:', err)
        return {} as CodecInfo
      }),
      extractMetadataFromFile(file).catch(err => {
        console.warn('Failed to extract metadata from original file:', err)
        return {} as VideoMetadata
      }),
    ])

    return {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      sizeMB: Number(sizeMB.toFixed(2)),
      dimension,
      duration,
      videoCodec: codecs.videoCodec,
      audioCodec: codecs.audioCodec,
      bitrate: codecs.bitrate ? Math.floor(codecs.bitrate) : undefined,
      qualityLabel,
      extractedMetadata: Object.keys(metadata).length > 0 ? metadata : undefined,
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

  let extractedMetadata: VideoMetadata | undefined

  // Extract codecs and metadata in parallel
  const [codecs, metadata] = await Promise.all([
    getCodecsFromUrl(url).catch(err => {
      console.warn('Failed to extract codecs from URL:', err)
      return {} as CodecInfo
    }),
    extractMetadataFromUrl(url).catch(err => {
      console.warn('Failed to extract metadata from URL:', err)
      return {} as VideoMetadata
    }),
  ])

  const videoCodec = codecs.videoCodec
  const audioCodec = codecs.audioCodec
  const bitrate = codecs.bitrate

  // Only include metadata if we found something
  if (Object.keys(metadata).length > 0) {
    extractedMetadata = metadata
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
    placement: createBlobPlacement({ candidateBlobs: mirroredBlobs, directUrl: url }),
    inputMethod: 'url',
    qualityLabel,
    extractedMetadata,
  }
}

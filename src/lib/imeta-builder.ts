import { type BlobDescriptor } from 'blossom-client-sdk'
import { type VideoVariant } from '@/lib/video-processing'
import { buildAdvancedMimeType } from '@/lib/utils'
import { generateQualityLabel } from '@/lib/video-processing'

/**
 * Parsed representation of an imeta tag, preserving the raw tag
 * for byte-for-byte preservation when not modified.
 */
export interface ParsedImeta {
  raw: string[] // original tag for byte-for-byte preservation
  url: string
  hash?: string
  size?: number // bytes
  dimensions?: string
  quality?: string // derived from dimensions
  mimeType?: string
  bitrate?: number
  fallbackUrls: string[]
  thumbnailUrls: string[]
  blurhash?: string
}

/**
 * Parse an imeta tag into a ParsedImeta object.
 * Preserves the raw tag for byte-for-byte reproduction when unchanged.
 */
export function parseImetaTag(tag: string[]): ParsedImeta | null {
  const values = new Map<string, string[]>()

  for (let i = 1; i < tag.length; i++) {
    const firstSpace = tag[i].indexOf(' ')
    let key: string | undefined, value: string | undefined
    if (firstSpace !== -1) {
      key = tag[i].slice(0, firstSpace)
      value = tag[i].slice(firstSpace + 1).trim()
    } else {
      key = tag[i]
      value = undefined
    }
    if (key && value) {
      if (!values.has(key)) {
        values.set(key, [value])
      } else {
        values.get(key)!.push(value)
      }
    }
  }

  const url = values.get('url')?.[0]
  if (!url) return null

  const mimeType = values.get('m')?.[0]
  const dimensions = values.get('dim')?.[0]
  const sizeStr = values.get('size')?.[0]
  const size = sizeStr ? parseInt(sizeStr, 10) : undefined
  const hash = values.get('x')?.[0]
  const blurhash = values.get('blurhash')?.[0]
  const bitrateStr = values.get('bitrate')?.[0]
  const bitrate = bitrateStr ? parseInt(bitrateStr, 10) : undefined

  const fallbackUrls: string[] = []
  values.get('fallback')?.forEach(u => fallbackUrls.push(u))
  values.get('mirror')?.forEach(u => fallbackUrls.push(u))

  const thumbnailUrls: string[] = []
  values.get('image')?.forEach(u => thumbnailUrls.push(u))

  let quality: string | undefined
  if (dimensions) {
    quality = generateQualityLabel(dimensions)
  }

  return {
    raw: tag,
    url,
    hash,
    size,
    dimensions,
    quality,
    mimeType,
    bitrate,
    fallbackUrls,
    thumbnailUrls,
    blurhash,
  }
}

/**
 * Parameters for building an imeta tag from a VideoVariant.
 */
export interface BuildImetaTagParams {
  variant: VideoVariant
  thumbnailUrls?: string[]
  blurhash?: string
}

/**
 * Build an imeta tag array from a VideoVariant and optional thumbnail/blurhash data.
 * Returns a string[] suitable for use as a Nostr event tag.
 */
export function buildImetaTag(params: BuildImetaTagParams): string[] {
  const { variant, thumbnailUrls, blurhash } = params

  const tag = ['imeta', `dim ${variant.dimension}`]

  const uploadedBlobs = variant.uploadedBlobs || []
  const mirroredBlobs = variant.mirroredBlobs || []

  // Add primary URL
  const primaryUrl = variant.inputMethod === 'url' ? variant.url : uploadedBlobs[0]?.url
  if (primaryUrl) {
    tag.push(`url ${primaryUrl}`)
  }

  // Add SHA256 hash
  if (uploadedBlobs[0]?.sha256) {
    tag.push(`x ${uploadedBlobs[0].sha256}`)
  }

  // Add MIME type with codecs
  const fileType = variant.file?.type
  tag.push(`m ${buildAdvancedMimeType(fileType, variant.videoCodec, variant.audioCodec)}`)

  // Add bitrate
  if (variant.bitrate) {
    tag.push(`bitrate ${variant.bitrate}`)
  }

  // Add file size in bytes
  if (variant.sizeMB) {
    const sizeBytes = Math.round(variant.sizeMB * 1024 * 1024)
    tag.push(`size ${sizeBytes}`)
  }

  // Add thumbnail URLs
  if (thumbnailUrls) {
    thumbnailUrls.forEach(url => tag.push(`image ${url}`))
  }

  // Add blurhash
  if (blurhash) {
    tag.push(`blurhash ${blurhash}`)
  }

  // Add fallback URLs from multiple upload servers
  if (variant.inputMethod === 'file') {
    if (uploadedBlobs.length > 1) {
      for (const blob of uploadedBlobs.slice(1)) {
        tag.push(`fallback ${blob.url}`)
      }
    }
    if (mirroredBlobs.length > 0) {
      for (const blob of mirroredBlobs) {
        tag.push(`fallback ${blob.url}`)
      }
    }
  }

  return tag
}

/**
 * Build an imeta tag from a ParsedImeta, replacing video-specific fields
 * while preserving thumbnail and blurhash entries from the original.
 * Used when replacing a variant's video file but keeping existing thumbnails.
 */
export function buildImetaTagFromParsed(params: {
  variant: VideoVariant
  originalImeta?: ParsedImeta
  thumbnailUrls?: string[]
  blurhash?: string
}): string[] {
  const { variant, originalImeta, thumbnailUrls, blurhash } = params

  // Use thumbnail URLs from original imeta if not explicitly provided
  const thumbUrls = thumbnailUrls ?? originalImeta?.thumbnailUrls ?? []
  const bhash = blurhash ?? originalImeta?.blurhash

  return buildImetaTag({ variant, thumbnailUrls: thumbUrls, blurhash: bhash })
}

/**
 * Build imeta tags for multiple video variants, collecting all fallback URLs.
 * Convenience wrapper used by buildVideoEvent.
 */
export function buildImetaTags(params: {
  videos: VideoVariant[]
  thumbnailUploadedBlobs: BlobDescriptor[]
  thumbnailMirroredBlobs: BlobDescriptor[]
  thumbnailBlurhash?: string
  isPreview?: boolean
  hasPendingThumbnail?: boolean
}): { imetaTags: string[][]; allFallbackUrls: string[] } {
  const {
    videos,
    thumbnailUploadedBlobs,
    thumbnailMirroredBlobs,
    thumbnailBlurhash,
    isPreview = false,
    hasPendingThumbnail = false,
  } = params

  const imetaTags: string[][] = []
  const allFallbackUrls: string[] = []

  // Collect thumbnail URLs from blobs
  const thumbUrls: string[] = [
    ...thumbnailUploadedBlobs.map(b => b.url),
    ...thumbnailMirroredBlobs.map(b => b.url),
  ]

  // For preview mode, show placeholder for pending thumbnail
  if (isPreview && hasPendingThumbnail && thumbnailUploadedBlobs.length === 0) {
    thumbUrls.push('<will be uploaded on publish>')
  }

  for (const video of videos) {
    const tag = buildImetaTag({
      variant: video,
      thumbnailUrls: thumbUrls,
      blurhash: thumbnailBlurhash,
    })
    imetaTags.push(tag)

    // Collect fallback URLs for the return value
    const uploadedBlobs = video.uploadedBlobs || []
    const mirroredBlobs = video.mirroredBlobs || []
    if (video.inputMethod === 'file') {
      if (uploadedBlobs.length > 1) {
        for (const blob of uploadedBlobs.slice(1)) {
          allFallbackUrls.push(blob.url)
        }
      }
      for (const blob of mirroredBlobs) {
        allFallbackUrls.push(blob.url)
      }
    }
  }

  return { imetaTags, allFallbackUrls }
}

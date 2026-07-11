import { type BlobDescriptor } from '@/lib/blossom-auth'
import { normalizeVideoVariantPlacement, type VideoVariant } from '@/lib/video-processing'
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
  duration?: number // seconds
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
  const durationStr = values.get('duration')?.[0]
  const duration = durationStr ? Math.floor(parseFloat(durationStr)) : undefined
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
    duration: Number.isFinite(duration) ? duration : undefined,
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
  const { thumbnailUrls, blurhash } = params
  const variant = normalizeVideoVariantPlacement(params.variant)
  const { placement } = variant
  const tag = ['imeta', `dim ${variant.dimension}`]

  // Blob placement, not acquisition provenance, determines the published URL and hash.
  const primaryUrl = placement.primaryBlob?.url ?? placement.directUrl
  if (primaryUrl) {
    tag.push(`url ${primaryUrl}`)
  }
  if (placement.primaryBlob) {
    tag.push(`x ${placement.primaryBlob.sha256}`)
  }

  // Add MIME type with codecs
  const baseMime = variant.mimeType || variant.file?.type
  tag.push(`m ${buildAdvancedMimeType(baseMime, variant.videoCodec, variant.audioCodec)}`)

  // Add bitrate
  if (variant.bitrate) {
    tag.push(`bitrate ${variant.bitrate}`)
  }

  // Add duration in seconds. NIP-71 recommends this as an imeta property.
  if (Number.isFinite(variant.duration)) {
    tag.push(`duration ${Math.floor(variant.duration)}`)
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

  // Verified same-hash Blob locations precede an unverified direct source URL.
  for (const blob of placement.fallbackBlobs) {
    tag.push(`fallback ${blob.url}`)
  }
  if (placement.directUrl) {
    tag.push(`fallback ${placement.directUrl}`)
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

    const placement = normalizeVideoVariantPlacement(video).placement
    allFallbackUrls.push(
      ...placement.fallbackBlobs.map(blob => blob.url),
      ...(placement.directUrl ? [placement.directUrl] : [])
    )
  }

  return { imetaTags, allFallbackUrls }
}

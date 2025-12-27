import type { VideoEvent, VideoVariant, TextTrack } from '@/utils/video-event'
import { extractBlossomHash } from '@/utils/video-event'

export type BlobType = 'video' | 'thumbnail' | 'subtitle'

export interface BlossomBlob {
  type: BlobType
  variant: VideoVariant
  label: string
  hash?: string
  ext?: string
}

/**
 * Deduplicate variants by URL or hash, preferring variants with more metadata
 */
export function deduplicateVariants(variants: VideoVariant[]): VideoVariant[] {
  const seen = new Map<string, VideoVariant>()

  for (const variant of variants) {
    const { sha256 } = extractBlossomHash(variant.url)
    // Use hash as key if available, otherwise use URL
    const key = sha256 || variant.url

    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, variant)
    } else {
      // Prefer variant with more metadata (dimensions, size, quality)
      const existingScore =
        (existing.dimensions ? 1 : 0) + (existing.size ? 1 : 0) + (existing.quality ? 1 : 0)
      const variantScore =
        (variant.dimensions ? 1 : 0) + (variant.size ? 1 : 0) + (variant.quality ? 1 : 0)
      if (variantScore > existingScore) {
        seen.set(key, variant)
      }
    }
  }

  return Array.from(seen.values())
}

/**
 * Convert TextTrack to VideoVariant for unified processing
 */
export function textTrackToVariant(textTrack: TextTrack): VideoVariant {
  const { sha256 } = extractBlossomHash(textTrack.url)
  return {
    url: textTrack.url,
    hash: sha256,
    fallbackUrls: [],
    mimeType: 'text/vtt',
  }
}

/**
 * Generate a descriptive label for a variant
 */
function getVariantLabel(
  variant: VideoVariant,
  index: number,
  total: number,
  type: 'Video' | 'Thumbnail' | 'Subtitle',
  extra?: string
): string {
  // Build quality/dimension string
  let qualityStr = ''
  if (variant.quality) {
    qualityStr = variant.quality
  } else if (variant.dimensions) {
    // Extract height from dimensions (e.g., "1920x1080" -> "1080p")
    const match = variant.dimensions.match(/x(\d+)/)
    if (match) {
      qualityStr = `${match[1]}p`
    } else {
      qualityStr = variant.dimensions
    }
  }

  // Combine quality and extra info (like language)
  const infoStr = [qualityStr, extra].filter(Boolean).join(' ')

  if (total === 1) {
    return infoStr ? `${type} (${infoStr})` : type
  }
  return infoStr ? `${type} ${index + 1} (${infoStr})` : `${type} ${index + 1}`
}

/**
 * Extract all blossom blobs from a VideoEvent
 * Returns deduplicated videos, thumbnails, and subtitles with labels
 */
export function extractAllBlossomBlobs(
  video: VideoEvent | null | undefined,
  textTracks?: TextTrack[]
): BlossomBlob[] {
  if (!video) return []

  const blobs: BlossomBlob[] = []

  // Use allVideoVariants to include ALL variants including incompatible codecs
  const videoVariants = video.allVideoVariants || video.videoVariants || []
  const thumbnailVariants = deduplicateVariants(video.thumbnailVariants || [])
  const textTrackVariants = (textTracks || video.textTracks || []).map(tt => ({
    variant: textTrackToVariant(tt),
    lang: tt.lang,
  }))

  // Add video variants
  videoVariants.forEach((variant, index) => {
    const { sha256, ext } = extractBlossomHash(variant.url)
    // Only include if it's a valid blossom URL
    if (sha256) {
      blobs.push({
        type: 'video',
        variant,
        label: getVariantLabel(variant, index, videoVariants.length, 'Video'),
        hash: sha256,
        ext: ext || 'mp4',
      })
    }
  })

  // Add thumbnail variants
  thumbnailVariants.forEach((variant, index) => {
    const { sha256, ext } = extractBlossomHash(variant.url)
    // Only include if it's a valid blossom URL
    if (sha256) {
      blobs.push({
        type: 'thumbnail',
        variant,
        label: getVariantLabel(variant, index, thumbnailVariants.length, 'Thumbnail'),
        hash: sha256,
        ext: ext || 'jpg',
      })
    }
  })

  // Add subtitle variants
  textTrackVariants.forEach(({ variant, lang }, index) => {
    const { sha256, ext } = extractBlossomHash(variant.url)
    // Only include if it's a valid blossom URL
    if (sha256) {
      blobs.push({
        type: 'subtitle',
        variant,
        label: getVariantLabel(variant, index, textTrackVariants.length, 'Subtitle', lang),
        hash: sha256,
        ext: ext || 'vtt',
      })
    }
  })

  return blobs
}

/**
 * Get the total size of all blobs
 */
export function getTotalBlobSize(blobs: BlossomBlob[]): number {
  return blobs.reduce((total, blob) => total + (blob.variant.size || 0), 0)
}

import { type VideoVariant } from '@/utils/video-event'
import { isCodecSupported } from './codec-compatibility'

/**
 * Specification for a recommended video transformation
 */
export interface TransformationSpec {
  targetResolution: string // e.g., "720p"
  targetCodec: string // e.g., "hvc1" or "avc1"
  reason: string // e.g., "iOS compatibility" or "Lower bandwidth"
  priority: 'high' | 'medium' | 'low'
}

/**
 * Result of transformation needs analysis
 */
export interface TransformationNeeds {
  needsLowerRes: boolean
  needsIOSCompatible: boolean
  recommendedTransforms: TransformationSpec[]
}

/**
 * Extract quality/resolution from variant data
 * Priority: quality field > parse from dimensions
 *
 * @param variant - Video variant object
 * @returns Quality string (e.g., "1080p") or undefined
 */
export function getQualityFromVariant(variant: VideoVariant): string | undefined {
  // First check quality field (preferred)
  if (variant.quality) {
    return variant.quality
  }

  // Fall back to parsing dimensions
  if (variant.dimensions) {
    const [width, height] = variant.dimensions.split('x').map(Number)
    const resolution = Math.max(width, height)

    if (resolution >= 3840) return '4K'
    if (resolution >= 2560) return '2K'
    if (resolution >= 1920) return '1080p'
    if (resolution >= 1280) return '720p'
    if (resolution >= 854) return '480p'
    if (resolution >= 640) return '360p'
    return `${resolution}p`
  }

  return undefined
}

/**
 * Extract resolution height as number from quality or dimensions
 *
 * @param variant - Video variant object
 * @returns Resolution height in pixels or undefined
 */
function getResolutionHeight(variant: VideoVariant): number | undefined {
  // Try to parse from quality field
  if (variant.quality) {
    if (variant.quality === '4K') return 2160
    if (variant.quality === '2K') return 1440
    const match = variant.quality.match(/(\d+)p/)
    if (match) return parseInt(match[1], 10)
  }

  // Fall back to parsing dimensions
  if (variant.dimensions) {
    const [width, height] = variant.dimensions.split('x').map(Number)
    return Math.max(width, height)
  }

  return undefined
}

/**
 * Extract codec identifier from MIME type string
 *
 * @param mimeType - MIME type string (e.g., "video/mp4; codecs=avc1.64001F")
 * @returns Codec identifier or undefined
 */
export function extractCodecFromMimeType(mimeType?: string): string | undefined {
  if (!mimeType) return undefined

  // Parse "codecs=" parameter
  const codecsMatch = mimeType.match(/codecs=["']?([^"';,]+)/)
  if (!codecsMatch) return undefined

  const codecsString = codecsMatch[1]

  // Handle multiple codecs (video + audio): extract first/video codec
  const codecs = codecsString.split(',').map(c => c.trim())
  if (codecs.length === 0) return undefined

  // Return the first codec (video codec), normalized to lowercase
  return codecs[0].split('.')[0].toLowerCase()
}

/**
 * Check if video only has high-resolution variants (1080p or higher)
 * and lacks accessible lower resolutions (720p or below)
 *
 * @param videoVariants - Array of video variants
 * @returns true if only high-res variants exist
 */
export function needsLowerResolutionVariants(videoVariants: VideoVariant[]): boolean {
  // Handle edge cases
  if (!videoVariants || videoVariants.length === 0) {
    return false
  }

  // Check if at least one variant has resolution data
  const hasResolutionData = videoVariants.some(v => v.quality || v.dimensions)
  if (!hasResolutionData) {
    return false
  }

  // Check if any variant is 720p or lower
  const hasLowerResVariant = videoVariants.some(variant => {
    const height = getResolutionHeight(variant)
    return height !== undefined && height <= 720
  })

  // If we have lower-res variants, no transformation needed
  if (hasLowerResVariant) {
    return false
  }

  // Check if all variants are 1080p or higher
  const allHighRes = videoVariants.every(variant => {
    const height = getResolutionHeight(variant)
    return height === undefined || height >= 1080
  })

  return allHighRes
}

/**
 * Check if video lacks iOS-compatible codec variants
 * iOS supports: hvc1, hev1 (HEVC in MP4), avc1, avc (H.264)
 * iOS does NOT support: hevc, h265 (generic names), vp9, av01
 *
 * @param videoVariants - Array of video variants
 * @returns true if no iOS-compatible variants exist
 */
export function needsIOSCompatibleVariants(videoVariants: VideoVariant[]): boolean {
  // Handle edge cases
  if (!videoVariants || videoVariants.length === 0) {
    return false
  }

  // Check if at least one variant has mimeType data
  const hasMimeTypeData = videoVariants.some(v => v.mimeType)
  if (!hasMimeTypeData) {
    return false
  }

  // Check if any variant is iOS-compatible
  const hasIOSCompatibleVariant = videoVariants.some(variant => {
    // Use mimeType directly if available
    if (variant.mimeType) {
      return isCodecSupported(variant.mimeType)
    }
    return false
  })

  // If we have at least one iOS-compatible variant, no transformation needed
  return !hasIOSCompatibleVariant
}

/**
 * Determine what transformations are needed for a video
 *
 * @param videoVariants - Array of video variants
 * @returns Object describing needed transformations
 */
export function getNeededTransformations(videoVariants: VideoVariant[]): TransformationNeeds {
  const needsLowerRes = needsLowerResolutionVariants(videoVariants)
  const needsIOSCompatible = needsIOSCompatibleVariants(videoVariants)

  const recommendedTransforms: TransformationSpec[] = []

  // Add iOS-compatible transformations (high priority)
  if (needsIOSCompatible) {
    recommendedTransforms.push({
      targetResolution: '720p',
      targetCodec: 'hvc1',
      reason: 'iOS compatibility (HEVC)',
      priority: 'high',
    })
    recommendedTransforms.push({
      targetResolution: '720p',
      targetCodec: 'avc1',
      reason: 'iOS compatibility (H.264)',
      priority: 'high',
    })
  }

  // Add lower resolution transformations (medium priority)
  if (needsLowerRes && !needsIOSCompatible) {
    // If we don't already have iOS-compat transforms at 720p, add lower-res versions
    recommendedTransforms.push({
      targetResolution: '720p',
      targetCodec: 'avc1',
      reason: 'Lower bandwidth (H.264)',
      priority: 'medium',
    })
    recommendedTransforms.push({
      targetResolution: '480p',
      targetCodec: 'avc1',
      reason: 'Lower bandwidth (H.264)',
      priority: 'medium',
    })
  }

  return {
    needsLowerRes,
    needsIOSCompatible,
    recommendedTransforms,
  }
}

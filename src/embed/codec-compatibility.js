/**
 * Codec compatibility utilities for embed player
 * Ensures videos play correctly across different platforms
 */

/**
 * Detect if the current device is iOS (iPhone, iPad, iPod)
 */
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false

  const userAgent = navigator.userAgent || navigator.vendor || window.opera || ''

  // Check for iOS devices
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    // iPad on iOS 13+ detection
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * List of codecs that are not supported on iOS Safari
 *
 * HEVC/H.265 support on iOS:
 * - hvc1/hev1 (MP4 container codec IDs) are fully supported in iOS 11+ with hardware decode
 * - Generic names 'hevc'/'h265' are NOT reliably supported in Safari
 * - Always use hvc1/hev1 codec identifiers in MIME types for iOS
 *
 * VP9 support on iOS:
 * - Not supported until iOS 14.5+ and only partially
 * - Better to avoid for compatibility
 *
 * AV1 support on iOS:
 * - Not supported until iOS 17+
 * - Limited to newer devices only
 */
const IOS_UNSUPPORTED_CODECS = [
  'hevc', // Generic HEVC name (use hvc1 instead)
  'h265', // Generic H.265 name (use hvc1 instead)
  'vp9', // VP9 (limited support)
  'av01', // AV1 (limited support)
  'av1', // AV1 alternative name
]

/**
 * Check if a MIME type or codec is supported on the current device
 * @param {string} mimeType - MIME type string (e.g., "video/mp4; codecs=hvc1")
 * @returns {boolean} true if supported, false if known to be unsupported
 */
export function isCodecSupported(mimeType) {
  if (!mimeType) return true // If no mime type, assume compatible

  const normalizedMime = mimeType.toLowerCase()

  // On iOS, filter out known unsupported codecs
  if (isIOSDevice()) {
    // Check if any unsupported codec is mentioned in the MIME type
    for (const codec of IOS_UNSUPPORTED_CODECS) {
      if (normalizedMime.includes(codec)) {
        console.log(`[Nostube Embed] Filtered incompatible codec on iOS: ${codec} in ${mimeType}`)
        return false
      }
    }
  }

  // Use native canPlayType if available (best detection)
  if (typeof document !== 'undefined') {
    const video = document.createElement('video')
    if (video.canPlayType) {
      const support = video.canPlayType(mimeType)
      // 'probably' or 'maybe' means supported
      // '' means not supported
      if (support === '') {
        console.log(`[Nostube Embed] Browser cannot play: ${mimeType}`)
        return false
      }
    }
  }

  return true
}

/**
 * Filter video variants to only include compatible codecs for the current device
 * @param {Array} variants - Array of video variants with mimeType
 * @returns {Array} Filtered array with only compatible variants
 */
export function filterCompatibleVariants(variants) {
  if (!variants || variants.length === 0) return variants

  const compatible = variants.filter(variant => isCodecSupported(variant.mimeType))

  // If all variants are filtered out, return original array
  // (better to try and fail than show nothing)
  if (compatible.length === 0) {
    console.warn(
      '[Nostube Embed] All variants filtered out, returning original variants as fallback'
    )
    return variants
  }

  if (compatible.length < variants.length) {
    console.log(
      `[Nostube Embed] Filtered ${variants.length - compatible.length} incompatible variants (${compatible.length} remaining)`
    )
  }

  return compatible
}

/**
 * Codec compatibility utilities for browser/device detection
 * Ensures videos play correctly across different platforms
 */

// Cache for logged messages to avoid spamming console
const loggedMessages = new Set<string>()

/**
 * Detect if the current device is iOS (iPhone, iPad, iPod)
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false

  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || ''

  // Check for iOS devices
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    // iPad on iOS 13+ detection
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Detect if the current browser is Safari
 */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false

  const userAgent = navigator.userAgent || ''
  return /^((?!chrome|android).)*safari/i.test(userAgent)
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
 * @param mimeType - MIME type string (e.g., "video/mp4; codecs=hvc1")
 * @returns true if supported, false if known to be unsupported
 */
export function isCodecSupported(mimeType?: string): boolean {
  if (!mimeType) return true // If no mime type, assume compatible

  const normalizedMime = mimeType.toLowerCase()

  // On iOS, filter out known unsupported codecs
  if (isIOSDevice()) {
    // Check if any unsupported codec is mentioned in the MIME type
    for (const codec of IOS_UNSUPPORTED_CODECS) {
      if (normalizedMime.includes(codec)) {
        if (import.meta.env.DEV) {
          const logKey = `ios-${codec}-${mimeType}`
          if (!loggedMessages.has(logKey)) {
            loggedMessages.add(logKey)
            console.log(
              `[Codec Filter] Filtered incompatible codec on iOS: ${codec} in ${mimeType}`
            )
          }
        }
        return false
      }
    }
  }

  // hvc1/hev1 are widely supported via hardware decoding even when
  // canPlayType reports no support - let the player try them
  const hardwareDecodedCodecs = ['hvc1', 'hev1']
  if (hardwareDecodedCodecs.some(codec => normalizedMime.includes(codec))) {
    return true
  }

  // Use native canPlayType if available (best detection)
  if (typeof document !== 'undefined') {
    const video = document.createElement('video')
    if (video.canPlayType) {
      const support = video.canPlayType(mimeType)
      // 'probably' or 'maybe' means supported
      // '' means not supported
      if (support === '') {
        if (import.meta.env.DEV) {
          const logKey = `canplay-${mimeType}`
          if (!loggedMessages.has(logKey)) {
            loggedMessages.add(logKey)
            console.log(`[Codec Filter] Browser cannot play: ${mimeType}`)
          }
        }
        return false
      }
    }
  }

  return true
}

/**
 * Filter video variants to only include compatible codecs for the current device
 * @param variants - Array of video variants with mimeType
 * @returns Filtered array with only compatible variants
 */
export function filterCompatibleVariants<T extends { mimeType?: string }>(variants: T[]): T[] {
  const compatible = variants.filter(variant => isCodecSupported(variant.mimeType))

  // If all variants are filtered out, return original array
  // (better to try and fail than show nothing)
  if (compatible.length === 0) {
    if (import.meta.env.DEV) {
      const logKey = `fallback-${variants.length}`
      if (!loggedMessages.has(logKey)) {
        loggedMessages.add(logKey)
        console.warn(
          '[Codec Filter] All variants filtered out, returning original variants as fallback'
        )
      }
    }
    return variants
  }

  // Don't log filtered variants count - too noisy

  return compatible
}

/**
 * Get preferred codec order for the current platform
 * On iOS: hvc1/hev1 (MP4 HEVC identifiers) are preferred due to excellent hardware support
 */
export function getPreferredCodecOrder(): string[] {
  if (isIOSDevice()) {
    return [
      'hvc1', // HEVC/H.265 MP4 codec ID - best for iOS (hardware accelerated)
      'hev1', // HEVC alternative MP4 codec ID
      'h264', // H.264/AVC - universal fallback
      'avc1', // H.264 codec tag
      'avc', // H.264 alternative
      'mp4', // Generic MP4 (usually H.264)
    ]
  }

  // On other platforms, prefer modern codecs
  return [
    'av01', // AV1 - best compression
    'av1',
    'vp9', // VP9 - good compression
    'hevc', // H.265 - good compression
    'h265',
    'hvc1', // HEVC codec tag
    'h264', // H.264 - universal fallback
    'avc1',
  ]
}

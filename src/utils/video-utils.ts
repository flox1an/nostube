/**
 * Video utility functions
 */

// Constants for ultra-wide video detection
export const SIXTEEN_NINE_RATIO = 16 / 9
export const ULTRA_WIDE_THRESHOLD = SIXTEEN_NINE_RATIO * 1.05

/**
 * Parse time parameter from URL
 * Supports seconds (e.g., "123"), mm:ss (e.g., "2:03"), or h:mm:ss (e.g., "1:02:03")
 */
export function parseTimeParam(t: string | null): number {
  if (!t) return 0
  if (/^\d+$/.test(t)) {
    // Simple seconds
    return parseInt(t, 10)
  }
  // mm:ss or h:mm:ss
  const parts = t.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) {
    // mm:ss
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    // h:mm:ss
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

/**
 * Encode URI component for URL building
 */
export function encodeUrlParam(val: string): string {
  return encodeURIComponent(val)
}

/**
 * Check if a video kind should loop
 */
export function shouldVideoLoop(kind: number | undefined): boolean {
  return [34236, 22].includes(kind ?? 0)
}

/**
 * Build share URL with optional timestamp
 */
export function buildShareUrl(
  baseUrl: string,
  nevent: string,
  includeTimestamp: boolean,
  currentTime: number
): string {
  const videoUrl = `${baseUrl}/video/${nevent}`
  const timestamp = includeTimestamp ? Math.floor(currentTime) : 0
  return timestamp > 0 ? `${videoUrl}?t=${timestamp}` : videoUrl
}

/**
 * Build social media share links
 */
export function buildShareLinks(shareUrl: string, fullUrl: string, title: string, thumbnailUrl: string) {
  const encode = encodeURIComponent
  const eUrl = encode(shareUrl)
  const eFull = encode(fullUrl)
  const eTitle = encode(title)
  const eThumb = encode(thumbnailUrl)

  return {
    mailto: `mailto:?body=${eUrl}`,
    whatsapp: `https://api.whatsapp.com/send/?text=${eTitle}%20${eUrl}`,
    x: `https://x.com/intent/tweet?url=${eUrl}&text=${eTitle}`,
    reddit: `https://www.reddit.com/submit?url=${eFull}&title=${eTitle}`,
    facebook: `https://www.facebook.com/share_channel/?type=reshare&link=${eFull}&display=popup`,
    pinterest: `https://www.pinterest.com/pin/create/button/?url=${eFull}&description=${eTitle}&is_video=true&media=${eThumb}`,
  }
}

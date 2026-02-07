import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import langs from 'langs'
import { defaultResizeServer } from '@/constants/servers'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Detects and filters out corrupted relay URLs that may contain:
 * - Multiple URLs concatenated together
 * - URL-encoded spaces (%20)
 * - Non-relay text mixed in (e.g., "avatar")
 *
 * Returns an array with the valid relay URL, or an empty array if corrupted.
 */
export function sanitizeRelayUrl(url: string): string[] {
  const trimmed = url.trim()
  if (!trimmed) return []

  // Check for corruption patterns:
  // - Multiple wss:// or ws:// protocols (concatenated URLs)
  // - URL-encoded spaces (%20)
  // - Whitespace in the URL
  // - Suspicious keywords like "avatar"
  const wssCount = (trimmed.match(/wss:\/\//g) || []).length
  const wsCount = (trimmed.match(/ws:\/\//g) || []).length
  const hasMultipleProtocols = wssCount > 1 || wsCount > 1 || wssCount + wsCount > 1
  const hasCorruptionPatterns =
    trimmed.includes('%20') || trimmed.includes('avatar') || /\s/.test(trimmed)

  // If the URL shows signs of corruption, ignore it completely
  if (hasMultipleProtocols || hasCorruptionPatterns) {
    return [] // Corrupted - ignore
  }

  // Normal relay URL - normalize and return
  return [normalizeRelayUrl(trimmed)]
}

/**
 * Normalizes a relay URL:
 * - Removes trailing slashes
 * - Ensures wss:// protocol (adds if missing)
 * - Trims whitespace
 */
export function normalizeRelayUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  // Add protocol if missing
  let normalized = trimmed
  if (!normalized.includes('://')) {
    normalized = `wss://${normalized}`
  }

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '')

  return normalized
}

/**
 * Takes a string[][] of relays sets and normalizes the url and return a unique list of relays
 */
export function mergeRelays(relaySets: string[][]): string[] {
  const normalizedRelays = new Set<string>()

  for (const set of relaySets) {
    for (const relayUrl of set) {
      normalizedRelays.add(normalizeRelayUrl(relayUrl))
    }
  }

  return Array.from(normalizedRelays)
}

/**
 * Combines multiple relay arrays with normalization and deduplication.
 * First arrays have priority (will appear first in the result).
 * URLs are normalized (trailing slashes removed, wss:// ensured) before deduplication.
 */
export function combineRelays(relayArrays: string[][]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const relayArray of relayArrays) {
    for (const relay of relayArray) {
      const normalized = normalizeRelayUrl(relay)
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        result.push(normalized)
      }
    }
  }

  return result
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export function nowInSecs() {
  return Math.floor(Date.now() / 1000)
}

export const formatBlobUrl = (url: string) => {
  return url.replace('https://', '').replace('http://', '').replace(/\/.*$/, '')
}

export function buildAdvancedMimeType(
  baseMimetype: string | undefined,
  videoCodec?: string,
  audioCodec?: string
): string {
  // Handle undefined/null baseMimetype
  const mimeType = baseMimetype || 'video/mp4'

  // If baseMimetype already contains a codecs parameter, return as is
  if (/codecs\s*=/.test(mimeType)) {
    return mimeType
  }

  const codecs: string[] = []

  if (videoCodec) {
    codecs.push(videoCodec)
  }
  if (audioCodec) {
    codecs.push(audioCodec)
  }

  if (codecs.length === 0) {
    // Remove any trailing semicolons or whitespace
    return mimeType.replace(/;\s*$/, '').trim()
  }

  const codecParam = `codecs="${codecs.join(',')}"`
  // Ensure no trailing semicolon before appending
  const cleanBase = mimeType.replace(/;\s*$/, '').trim()
  return `${cleanBase}; ${codecParam}`
}

/**
 * Maps a BCP-47/ISO language code (e.g. 'en', 'en-US', 'fr', 'de-DE') to a human-readable language name.
 * Falls back to the code itself if not found.
 * Examples:
 *   'en' => 'English'
 *   'en-US' => 'English (United States)'
 *   'fr' => 'French'
 *   'de-DE' => 'German (Germany)'
 */
export function getLanguageLabel(lang: string): string {
  if (!lang) return ''
  // Split language and region
  const [language, region] = lang.split(/[-_]/)
  const entry =
    langs.where('1', language) ||
    langs.where('2', language) ||
    langs.where('2T', language) ||
    langs.where('2B', language) ||
    langs.where('3', language)
  if (!entry) return lang
  let label = entry.name
  if (region) {
    // Try to get region name (e.g. 'US' => 'United States')
    // Use Intl.DisplayNames if available
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
        const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(
          region.toUpperCase()
        )
        if (regionName && regionName !== region.toUpperCase()) {
          label += ` (${regionName})`
        } else {
          label += ` (${region.toUpperCase()})`
        }
      } else {
        label += ` (${region.toUpperCase()})`
      }
    } catch {
      label += ` (${region.toUpperCase()})`
    }
  }
  return label
}

export const imageProxy = (url?: string, proxyBaseUrl?: string) => {
  if (!url) return ''
  // Check for data URLs and return them immediately
  if (url.startsWith('data:')) return url
  const baseUrl = proxyBaseUrl || defaultResizeServer
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  return `${cleanBaseUrl}/insecure/f:webp/rs:fill:80:80/plain/${encodeURIComponent(url)}`
}

/**
 * Add file extension to URL based on MIME type if missing
 * This is needed for image proxies that detect file type from extension
 */
export function ensureFileExtension(url: string, mimeType?: string): string {
  if (!url || !mimeType) return url

  // Check if URL already has an extension
  const urlObj = new URL(url)
  const pathname = urlObj.pathname
  const hasExtension = /\.\w+$/.test(pathname)

  if (hasExtension) return url

  // Map MIME types to extensions
  const extensionMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  }

  const extension = extensionMap[mimeType.toLowerCase()]
  if (!extension) return url

  // Append extension to the pathname
  urlObj.pathname += extension
  return urlObj.toString()
}

export const imageProxyVideoPreview = (url?: string, proxyBaseUrl?: string) => {
  if (!url) return ''
  // Check for data URLs and return them immediately
  if (url.startsWith('data:')) return url
  const baseUrl = proxyBaseUrl || defaultResizeServer
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  return `${cleanBaseUrl}/insecure/f:webp/rs:fit:480:480/plain/${encodeURIComponent(url)}`
}

/**
 * Generate thumbnail from video URL using imgproxy's video thumbnail feature
 * This is used as a fallback when the image thumbnail fails to load
 */
export const imageProxyVideoThumbnail = (videoUrl: string, proxyBaseUrl?: string) => {
  if (!videoUrl) return ''
  // Check for data URLs and return them immediately
  if (videoUrl.startsWith('data:')) return videoUrl
  const baseUrl = proxyBaseUrl || defaultResizeServer
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  // imgproxy can generate thumbnails from video URLs
  // Format: /insecure/f:webp/rs:fit:480:480/plain/{video_url}
  // The video URL itself will be used to extract a frame
  return `${cleanBaseUrl}/insecure/f:webp/rs:fit:480:480/plain/${encodeURIComponent(videoUrl)}`
}

function bigIntHash(str: string): string {
  let hash = BigInt(0)
  for (let i = 0; i < str.length; i++) {
    hash = (hash << BigInt(5)) - hash + BigInt(str.charCodeAt(i))
    hash &= BigInt('0xFFFFFFFFFFFFFFFF') // simulate 64-bit unsigned
  }
  return hash.toString(16) // hex string
}

export function hashObjectBigInt(obj: object): string {
  const json = JSON.stringify(obj, Object.keys(obj).sort())
  return bigIntHash(json)
}

export function isVideoUrl(url: string) {
  return (
    url.endsWith('.mp4') ||
    url.endsWith('.webm') ||
    url.endsWith('.mov') ||
    url.endsWith('.avi') ||
    url.endsWith('.mkv') ||
    url.endsWith('.flv') ||
    url.endsWith('.wmv') ||
    url.endsWith('.m4v') ||
    url.endsWith('.m4a') ||
    url.endsWith('.m4b') ||
    url.endsWith('.m4p') ||
    url.endsWith('.m4v') ||
    url.endsWith('.m4a') ||
    url.endsWith('.m4b') ||
    url.endsWith('.m4p') ||
    url.endsWith('.m4v') ||
    url.endsWith('.m4a') ||
    url.endsWith('.m4b') ||
    url.endsWith('.m4p')
  )
}

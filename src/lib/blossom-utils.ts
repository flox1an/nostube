import type { NostrEvent } from 'nostr-tools'
import { extractBlossomHash } from '@/utils/video-event'

/**
 * Format bytes to human-readable size (MB or GB)
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return 'size unknown'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

/**
 * Normalize a server URL to a consistent format (remove trailing slash, remove path, preserve port)
 */
export function normalizeServerUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // Normalize: protocol + lowercase host (with port) - no trailing slash, no path
    return `${urlObj.protocol}//${urlObj.host.toLowerCase()}`
  } catch {
    // Fallback: just remove trailing slash
    return url.replace(/\/$/, '')
  }
}

/**
 * Parse a value to a numeric size in bytes
 */
export function parseNumericSize(value?: string | number | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = parseInt(trimmed, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

/**
 * Extract video size from Nostr event tags (size tag or imeta tag)
 */
export function getSizeFromVideoEvent(event?: NostrEvent | null): number | undefined {
  if (!event) return undefined
  const sizeTag = event.tags.find(tag => tag[0] === 'size')
  const directSize = sizeTag ? parseNumericSize(sizeTag[1]) : undefined
  if (directSize) return directSize

  const imetaTag = event.tags.find(tag => tag[0] === 'imeta')
  if (!imetaTag) return undefined

  for (let i = 1; i < imetaTag.length; i++) {
    const entry = imetaTag[i]
    const separatorIndex = entry.indexOf(' ')
    if (separatorIndex === -1) continue
    const key = entry.slice(0, separatorIndex)
    const value = entry.slice(separatorIndex + 1)
    if (key === 'size') {
      const parsed = parseNumericSize(value)
      if (parsed) return parsed
    }
  }

  return undefined
}

/**
 * Decode a URL-encoded string if it's different from the original
 */
function decodeIfDifferent(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value)
    return decoded !== value ? decoded : undefined
  } catch {
    return undefined
  }
}

/**
 * Parse Blossom-Descriptor header value to extract size
 */
export function parseDescriptorSize(headerValue?: string | null): number | undefined {
  if (!headerValue) return undefined
  const attempts = new Set<string>()
  const trimmed = headerValue.trim()
  if (trimmed) {
    attempts.add(trimmed)
    const decoded = decodeIfDifferent(trimmed)
    if (decoded) attempts.add(decoded)
  }

  for (const candidate of attempts) {
    try {
      const parsedJson = JSON.parse(candidate)
      if (parsedJson && typeof parsedJson === 'object') {
        const possibleSizes = [
          (parsedJson as Record<string, unknown>).size,
          (parsedJson as Record<string, any>).blob?.size,
          (parsedJson as Record<string, any>).meta?.size,
        ]
        for (const maybeSize of possibleSizes) {
          const normalized = parseNumericSize(maybeSize)
          if (normalized) return normalized
        }
      }
    } catch {
      // Not JSON, fall through to numeric extraction
    }

    const numericDirect = parseNumericSize(candidate)
    if (numericDirect) return numericDirect

    const match = candidate.match(/(\d+)/)
    if (match) {
      const parsed = parseInt(match[1], 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  return undefined
}

/**
 * Build Blossom HEAD request URLs from video URLs
 */
export function buildBlossomHeadUrls(videoUrls: string[]): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  for (const url of videoUrls) {
    const { sha256, ext } = extractBlossomHash(url.split('?')[0])
    if (!sha256) continue

    try {
      const urlObj = new URL(url)
      const hostCandidates = new Set<string>()
      const originParam = urlObj.searchParams.get('origin')
      if (originParam) {
        try {
          const originUrl = new URL(originParam)
          hostCandidates.add(originUrl.origin)
        } catch {
          // ignore invalid origin parameter
        }
      }
      hostCandidates.add(urlObj.origin)

      for (const host of hostCandidates) {
        const normalizedHost = host.replace(/\/$/, '')
        const candidateUrl = `${normalizedHost}/${sha256}${ext ? `.${ext}` : ''}`
        if (!seen.has(candidateUrl)) {
          seen.add(candidateUrl)
          urls.push(candidateUrl)
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return urls
}

/**
 * Fetch video size from Blossom servers using HEAD requests
 */
export async function fetchVideoSizeFromBlossom(videoUrls: string[]): Promise<number | undefined> {
  const targets = buildBlossomHeadUrls(videoUrls)
  if (targets.length === 0) return undefined

  for (const target of targets) {
    try {
      const response = await fetch(target, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        continue
      }

      const descriptorHeader =
        response.headers.get('Blossom-Descriptor') || response.headers.get('blossom-descriptor')
      const descriptorSize = parseDescriptorSize(descriptorHeader)
      if (descriptorSize) {
        return descriptorSize
      }

      const contentLengthSize = parseNumericSize(response.headers.get('content-length'))
      if (contentLengthSize) {
        return contentLengthSize
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[blossom-utils] Failed to resolve blob size via HEAD', error)
      }
    }
  }

  return undefined
}

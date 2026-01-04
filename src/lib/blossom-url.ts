/**
 * Unified Blossom URL utilities
 *
 * This module provides all Blossom URL detection, validation, and extraction utilities.
 * Blossom URLs have format: https://server.com/{sha256}.{ext}
 */

/**
 * Servers that look like Blossom servers but resize/re-encode videos,
 * so the SHA256 hash in the URL doesn't match the actual content.
 * These should NOT be treated as Blossom servers for mirroring/fallback purposes.
 */
export const NON_BLOSSOM_SERVERS = ['video.nostr.build', 'cdn.nostrcheck.me']

/**
 * Blossom servers that should be blocked/filtered out from user configuration.
 * These servers re-encode videos and serve low-quality content.
 */
export const BLOCKED_BLOSSOM_SERVERS = ['cdn.nostrcheck.me']

/**
 * Check if a URL is from a non-Blossom server (one that resizes/re-encodes content).
 * @param url - The URL to check
 * @returns true if the URL is from a non-Blossom server
 */
export function isNonBlossomServer(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const host = urlObj.host.toLowerCase()
    return NON_BLOSSOM_SERVERS.some(server => host.includes(server.toLowerCase()))
  } catch {
    return false
  }
}

/**
 * Check if a blossom server URL should be blocked from user configuration.
 * @param url - The server URL to check (with or without protocol)
 * @returns true if the server should be blocked
 */
export function isBlossomServerBlocked(url: string): boolean {
  const normalizedUrl = url.toLowerCase()
  return BLOCKED_BLOSSOM_SERVERS.some(blocked => normalizedUrl.includes(blocked.toLowerCase()))
}

/**
 * Extract SHA256 hash and file extension from a Blossom URL.
 * Returns empty object for non-Blossom URLs or URLs from non-Blossom servers.
 *
 * @param url - The URL to parse
 * @returns Object with sha256 hash and extension, or empty object if not a valid Blossom URL
 */
export function extractBlossomHash(url: string): { sha256?: string; ext?: string } {
  // Data URLs are not Blossom URLs
  if (url.startsWith('data:')) {
    return {}
  }

  // Check if it's from a non-Blossom server first
  if (isNonBlossomServer(url)) {
    return {}
  }

  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname

    // Extract filename from path
    const filename = pathname.split('/').pop() || ''

    // Check if it looks like a Blossom URL (64 char hex hash + optional extension)
    // Supports both /hash.ext and /hash formats
    const matchWithExt = filename.match(/^([a-f0-9]{64})\.([^.]+)$/i)
    if (matchWithExt) {
      return {
        sha256: matchWithExt[1].toLowerCase(),
        ext: matchWithExt[2],
      }
    }

    // Also match bare hash without extension
    const matchBare = filename.match(/^([a-f0-9]{64})$/i)
    if (matchBare) {
      return {
        sha256: matchBare[1].toLowerCase(),
      }
    }

    return {}
  } catch {
    return {}
  }
}

/**
 * Check if a URL is a valid Blossom URL (has SHA256 hash in path from a real Blossom server).
 *
 * @param url - The URL to check
 * @returns true if the URL is a valid Blossom URL
 */
export function isBlossomUrl(url: string): boolean {
  const { sha256 } = extractBlossomHash(url)
  return Boolean(sha256)
}

/**
 * Parse a Blossom URL and extract hash, extension, and server information.
 *
 * @param url - The URL to parse
 * @returns Object with isBlossomUrl flag, and if true, sha256, ext, and server URL
 */
export function parseBlossomUrl(url: string): {
  isBlossomUrl: boolean
  sha256?: string
  ext?: string
  server?: string
} {
  const { sha256, ext } = extractBlossomHash(url)

  if (!sha256) {
    return { isBlossomUrl: false }
  }

  try {
    const urlObj = new URL(url)
    const server = `${urlObj.protocol}//${urlObj.host}`
    return {
      isBlossomUrl: true,
      sha256,
      ext,
      server,
    }
  } catch {
    return { isBlossomUrl: false }
  }
}

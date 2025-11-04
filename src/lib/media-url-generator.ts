/**
 * Media URL Generator
 *
 * Central service for generating URL arrays with fallbacks for any media type.
 * Supports videos, images, VTT captions, and audio files.
 */

import type { BlossomServer } from '@/contexts/AppContext'

export type MediaType = 'video' | 'image' | 'vtt' | 'audio'

export type UrlSource = 'original' | 'mirror' | 'proxy' | 'discovered'

export interface MediaUrlOptions {
  urls: string[] // Original URLs from event
  blossomServers: BlossomServer[] // User's + app config servers
  sha256?: string // File hash for discovery
  kind?: number // Event kind for relay search
  mediaType: MediaType
  proxyConfig?: {
    enabled: boolean
    origin?: string
    maxSize?: { width: number; height: number }
  }
}

export interface UrlMetadata {
  source: UrlSource
  serverUrl?: string // Which Blossom server
  isValidated?: boolean // Pre-validated via HEAD?
}

export interface GeneratedUrls {
  urls: string[] // All URLs in priority order
  metadata: UrlMetadata[]
}

/**
 * Extract SHA256 hash and file extension from a Blossom URL
 * Blossom URLs have format: https://server.com/{sha256}.{ext}
 */
export function extractBlossomHash(url: string): { sha256?: string; ext?: string } {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname

    // Extract filename from path
    const filename = pathname.split('/').pop() || ''

    // Check if it looks like a Blossom URL (64 char hex hash + extension)
    const match = filename.match(/^([a-f0-9]{64})\.([^.]+)$/i)
    if (match) {
      return {
        sha256: match[1],
        ext: match[2],
      }
    }

    return {}
  } catch {
    return {}
  }
}

/**
 * Extract protocol + hostname from a URL
 */
function extractOrigin(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.hostname}`
  } catch {
    return null
  }
}

/**
 * Check if a URL is a valid Blossom URL
 */
export function isBlossomUrl(url: string): boolean {
  const { sha256 } = extractBlossomHash(url)
  return Boolean(sha256)
}

/**
 * Generate mirror URLs for a given original URL
 * Mirror URLs are exact copies from user's Blossom servers
 */
function generateMirrorUrls(
  originalUrl: string,
  mirrorServers: BlossomServer[]
): { urls: string[]; metadata: UrlMetadata[] } {
  const urls: string[] = []
  const metadata: UrlMetadata[] = []

  const { sha256, ext } = extractBlossomHash(originalUrl)
  if (!sha256 || !ext) {
    return { urls, metadata }
  }

  for (const server of mirrorServers) {
    const baseUrl = server.url.replace(/\/$/, '')
    const mirrorUrl = `${baseUrl}/${sha256}.${ext}`

    urls.push(mirrorUrl)
    metadata.push({
      source: 'mirror',
      serverUrl: server.url,
    })
  }

  return { urls, metadata }
}

/**
 * Generate proxy URLs for a given original URL
 * Proxy URLs are transcoded/resized versions from Blossom servers
 */
function generateProxyUrls(
  originalUrl: string,
  proxyServers: BlossomServer[],
  proxyConfig?: MediaUrlOptions['proxyConfig']
): { urls: string[]; metadata: UrlMetadata[] } {
  const urls: string[] = []
  const metadata: UrlMetadata[] = []

  if (!proxyConfig?.enabled) {
    return { urls, metadata }
  }

  const { sha256, ext } = extractBlossomHash(originalUrl)
  if (!sha256 || !ext) {
    return { urls, metadata }
  }

  const originBase = extractOrigin(originalUrl)
  if (!originBase) {
    return { urls, metadata }
  }

  for (const server of proxyServers) {
    const baseUrl = server.url.replace(/\/$/, '')
    const proxyOrigin = extractOrigin(baseUrl)

    if (!proxyOrigin) continue

    // Build proxy URL
    let proxyUrl = `${baseUrl}/${sha256}.${ext}`

    // Add query parameters
    const params = new URLSearchParams()

    // If origin doesn't match proxy server, add origin parameter
    if (originBase !== proxyOrigin) {
      params.set('origin', originBase)
    }

    // Add size parameters for images
    if (proxyConfig.maxSize && ['image', 'video'].includes(proxyConfig.maxSize.toString())) {
      if (proxyConfig.maxSize.width) {
        params.set('width', proxyConfig.maxSize.width.toString())
      }
      if (proxyConfig.maxSize.height) {
        params.set('height', proxyConfig.maxSize.height.toString())
      }
    }

    // Append query string if we have parameters
    if (params.toString()) {
      proxyUrl += `?${params.toString()}`
    }

    urls.push(proxyUrl)
    metadata.push({
      source: 'proxy',
      serverUrl: server.url,
    })
  }

  return { urls, metadata }
}

/**
 * Generate all possible media URLs with fallbacks
 *
 * Priority Order:
 * 1. Original URLs (if valid Blossom URLs)
 * 2. Mirror URLs (exact copies from user's Blossom servers)
 * 3. Proxy URLs (transcoded/resized versions from Blossom servers)
 * 4. Original URLs again (if not Blossom URLs)
 */
export function generateMediaUrls(options: MediaUrlOptions): GeneratedUrls {
  const { urls: originalUrls, blossomServers, proxyConfig } = options

  const allUrls: string[] = []
  const allMetadata: UrlMetadata[] = []

  // Filter servers by type
  const mirrorServers = blossomServers.filter(server => server.tags.includes('mirror'))
  const proxyServers = blossomServers.filter(server => server.tags.includes('proxy'))

  // Process each original URL
  for (const originalUrl of originalUrls) {
    const isBlossom = isBlossomUrl(originalUrl)

    // 1. Add valid Blossom original URLs first
    if (isBlossom) {
      allUrls.push(originalUrl)
      allMetadata.push({ source: 'original' })
    }

    // 2. Generate and add mirror URLs
    if (mirrorServers.length > 0) {
      const { urls: mirrorUrls, metadata: mirrorMetadata } = generateMirrorUrls(
        originalUrl,
        mirrorServers
      )
      allUrls.push(...mirrorUrls)
      allMetadata.push(...mirrorMetadata)
    }

    // 3. Generate and add proxy URLs
    if (proxyServers.length > 0) {
      const { urls: proxyUrls, metadata: proxyMetadata } = generateProxyUrls(
        originalUrl,
        proxyServers,
        proxyConfig
      )
      allUrls.push(...proxyUrls)
      allMetadata.push(...proxyMetadata)
    }

    // 4. Add non-Blossom URLs at the end
    if (!isBlossom) {
      allUrls.push(originalUrl)
      allMetadata.push({ source: 'original' })
    }
  }

  // Remove duplicates while preserving order
  const uniqueUrls: string[] = []
  const uniqueMetadata: UrlMetadata[] = []
  const seen = new Set<string>()

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i]
    if (!seen.has(url)) {
      seen.add(url)
      uniqueUrls.push(url)
      uniqueMetadata.push(allMetadata[i])
    }
  }

  return {
    urls: uniqueUrls,
    metadata: uniqueMetadata,
  }
}

/**
 * Generate media URLs for multiple resources
 * Useful for batch processing (e.g., playlist preloading)
 */
export function generateMediaUrlsBatch(options: MediaUrlOptions[]): GeneratedUrls[] {
  return options.map(generateMediaUrls)
}

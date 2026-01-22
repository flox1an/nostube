/**
 * Media URL Generator
 *
 * Central service for generating URL arrays with fallbacks for any media type.
 * Supports videos, images, VTT captions, and audio files.
 */

import type { BlossomServer, CachingServer } from '@/contexts/AppContext'
import { normalizeServerUrl } from './blossom-utils'
import { extractBlossomHash, isBlossomUrl } from './blossom-url'

// Re-export for backwards compatibility
export { extractBlossomHash, isBlossomUrl }

export type MediaType = 'video' | 'image' | 'vtt' | 'audio'

export type UrlSource = 'original' | 'mirror' | 'proxy' | 'discovered'

export interface MediaUrlOptions {
  urls: string[] // Original URLs from event
  blossomServers: BlossomServer[] // User's + app config servers
  cachingServers?: CachingServer[] // Servers for caching/proxying content
  sha256?: string // File hash for discovery
  kind?: number // Event kind for relay search
  mediaType: MediaType
  authorPubkey?: string // Author pubkey (npub or hex) for AS query parameter
  proxyConfig?: {
    enabled: boolean
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
    const baseUrl = normalizeServerUrl(server.url)
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
 * Proxy URLs are transcoded/resized versions from caching servers
 * Uses XS query parameters for servers and AS for author
 */
function generateProxyUrls(
  originalUrl: string,
  cachingServers: CachingServer[],
  proxyConfig?: MediaUrlOptions['proxyConfig'],
  authorPubkey?: string,
  mirrorServers: BlossomServer[] = [],
  mediaType?: MediaType
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

  // Extract origin from original URL to check for self-reference
  let originalOrigin = ''
  try {
    const urlObj = new URL(originalUrl)
    originalOrigin = urlObj.origin
  } catch {
    // If URL parsing fails, skip this URL
    return { urls, metadata }
  }

  // Generate proxy URLs for each caching server
  for (const server of cachingServers) {
    const baseUrl = normalizeServerUrl(server.url)

    // Check if the original URL is already from this caching server
    let proxyOrigin = ''
    try {
      const proxyUrlObj = new URL(baseUrl)
      proxyOrigin = proxyUrlObj.origin
    } catch {
      // If URL parsing fails, skip this caching server
      continue
    }

    // Skip if the original URL already points to this caching server
    if (originalOrigin === proxyOrigin) {
      continue
    }

    // Build proxy URL
    let proxyUrl = `${baseUrl}/${sha256}.${ext}`

    // Add query parameters
    const params = new URLSearchParams()
    const addedHostnames = new Set<string>() // Track added hostnames to avoid duplicates

    // Add all caching servers as XS query parameters (except the current caching server)
    for (const cachingServer of cachingServers) {
      const proxyServerUrl = normalizeServerUrl(cachingServer.url)

      // Skip if this is the same server we're creating the proxy URL for
      try {
        const proxyServerOrigin = new URL(proxyServerUrl).origin
        if (proxyServerOrigin === proxyOrigin) {
          continue
        }

        // Extract hostname only (without protocol)
        const hostname = new URL(proxyServerUrl).hostname
        if (!addedHostnames.has(hostname)) {
          params.append('xs', hostname)
          addedHostnames.add(hostname)
        }
      } catch {
        // If URL parsing fails, skip this proxy server
        continue
      }
    }

    // Add mirror servers as XS query parameters (they can serve the content as fallbacks)
    for (const mirrorServer of mirrorServers) {
      const mirrorServerUrl = mirrorServer.url.replace(/\/$/, '')

      // Skip if this mirror server is the same as the current proxy server
      try {
        const mirrorServerOrigin = new URL(mirrorServerUrl).origin
        if (mirrorServerOrigin === proxyOrigin) {
          continue
        }

        // Extract hostname only (without protocol)
        const hostname = new URL(mirrorServerUrl).hostname
        if (!addedHostnames.has(hostname)) {
          params.append('xs', hostname)
          addedHostnames.add(hostname)
        }
      } catch {
        // If URL parsing fails, skip this mirror server
        continue
      }
    }

    // Add original URL's server as XS parameter if it's a Blossom server and different from proxy
    // This allows the proxy server to fall back to the original source if needed
    if (originalOrigin && originalOrigin !== proxyOrigin) {
      try {
        const originalHostname = new URL(originalUrl).hostname
        if (!addedHostnames.has(originalHostname)) {
          params.append('xs', originalHostname)
          addedHostnames.add(originalHostname)
        }
      } catch {
        // If URL parsing fails, skip
      }
    }

    // Add author parameter (AS) if provided (can be npub or hex)
    if (authorPubkey) {
      params.set('as', authorPubkey.toLowerCase())
    }

    // Add size parameters for images and videos
    if (proxyConfig.maxSize && mediaType && ['image', 'video'].includes(mediaType)) {
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
 * Check if a URL is a data URL (e.g., data:image/png;base64,...)
 */
function isDataUrl(url: string): boolean {
  return url.startsWith('data:')
}

/**
 * Generate all possible media URLs with fallbacks
 *
 * Priority Order:
 * 1. Proxy URLs (if caching servers configured - tried first with backend servers as fallbacks)
 * 2. Original URLs (if valid Blossom URLs)
 * 3. Mirror URLs (exact copies from user's Blossom servers)
 * 4. Original URLs again (if not Blossom URLs)
 *
 * Data URLs are returned immediately without any processing.
 */
export function generateMediaUrls(options: MediaUrlOptions): GeneratedUrls {
  const {
    urls: originalUrls,
    blossomServers,
    cachingServers = [],
    proxyConfig,
    authorPubkey,
    mediaType,
  } = options

  const allUrls: string[] = []
  const allMetadata: UrlMetadata[] = []

  // Filter Blossom servers by type
  const mirrorServers = blossomServers.filter(server => server.tags.includes('mirror'))

  // Process each original URL
  for (const originalUrl of originalUrls) {
    // Data URLs should be used directly without any processing
    if (isDataUrl(originalUrl)) {
      allUrls.push(originalUrl)
      allMetadata.push({ source: 'original' })
      continue
    }

    const isBlossom = isBlossomUrl(originalUrl)

    // 1. Generate and add proxy URLs FIRST (if caching servers configured)
    if (cachingServers.length > 0) {
      const { urls: proxyUrls, metadata: proxyMetadata } = generateProxyUrls(
        originalUrl,
        cachingServers,
        proxyConfig,
        authorPubkey,
        mirrorServers,
        mediaType
      )
      allUrls.push(...proxyUrls)
      allMetadata.push(...proxyMetadata)
    }

    // 2. Add valid Blossom original URLs
    if (isBlossom) {
      allUrls.push(originalUrl)
      allMetadata.push({ source: 'original' })
    }

    // 3. Generate and add mirror URLs
    if (mirrorServers.length > 0) {
      const { urls: mirrorUrls, metadata: mirrorMetadata } = generateMirrorUrls(
        originalUrl,
        mirrorServers
      )
      allUrls.push(...mirrorUrls)
      allMetadata.push(...mirrorMetadata)
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

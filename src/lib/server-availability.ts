/**
 * Shared types and utilities for Blossom server availability checking
 */
import { extractBlossomHash } from '@/lib/blossom-url'
import { normalizeServerUrl } from '@/lib/blossom-utils'
import type { BlossomServer } from '@/contexts/AppContext'

export type ServerStatus = 'unknown' | 'checking' | 'available' | 'unavailable' | 'error'

export interface ServerInfo {
  url: string // Normalized server URL (no trailing slash)
  name: string // Human-readable name (hostname)
  source: 'video-url' | 'config' | 'user' // Where we found this server
}

export interface ServerAvailability extends ServerInfo {
  status: ServerStatus
  statusCode?: number // HTTP status from HEAD request
  contentLength?: number // File size from Content-Length header
  lastChecked?: number // Timestamp of last check
}

/**
 * Extract server information from video URLs, config, and user preferences
 */
export function extractServerList(
  variantUrls: string[],
  configServers?: BlossomServer[],
  userServers?: string[]
): ServerInfo[] {
  const serverMap = new Map<string, ServerInfo>()

  // Extract servers from video URLs
  for (const url of variantUrls) {
    // Skip proxy URLs (they have ?origin= or ?xs= query parameters)
    if (url.includes('?origin=') || url.includes('?xs=')) continue

    try {
      const urlObj = new URL(url)
      const { sha256 } = extractBlossomHash(url)
      // Only count if it's a valid blossom URL (has SHA256 hash)
      if (sha256) {
        const normalized = normalizeServerUrl(urlObj.origin)
        if (!serverMap.has(normalized)) {
          serverMap.set(normalized, {
            url: normalized,
            name: new URL(normalized).hostname,
            source: 'video-url',
          })
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Add user's blossom servers from kind 10063
  if (userServers && userServers.length > 0) {
    for (const serverUrl of userServers) {
      const normalized = normalizeServerUrl(serverUrl)
      if (!serverMap.has(normalized)) {
        serverMap.set(normalized, {
          url: normalized,
          name: new URL(normalized).hostname,
          source: 'user',
        })
      }
    }
  }

  // Add servers from app config
  if (configServers && configServers.length > 0) {
    for (const server of configServers) {
      const normalized = normalizeServerUrl(server.url)
      if (!serverMap.has(normalized)) {
        serverMap.set(normalized, {
          url: normalized,
          name: server.name || new URL(normalized).hostname,
          source: 'config',
        })
      }
    }
  }

  // Sort: video-url sources first (they definitely have the file), then alphabetically
  return Array.from(serverMap.values()).sort((a, b) => {
    if (a.source === 'video-url' && b.source !== 'video-url') return -1
    if (a.source !== 'video-url' && b.source === 'video-url') return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Check if a file exists on a blossom server using HEAD request
 */
export async function checkBlossomServer(
  serverUrl: string,
  sha256: string,
  ext: string
): Promise<Omit<ServerAvailability, 'url' | 'name' | 'source'>> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const fileUrl = `${normalizedUrl}/${sha256}.${ext}`

  try {
    const response = await fetch(fileUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    const contentLength = response.headers.get('content-length')

    return {
      status: response.ok ? 'available' : 'unavailable',
      statusCode: response.status,
      contentLength: contentLength ? parseInt(contentLength) : undefined,
      lastChecked: Date.now(),
    }
  } catch {
    return {
      status: 'error',
      lastChecked: Date.now(),
    }
  }
}

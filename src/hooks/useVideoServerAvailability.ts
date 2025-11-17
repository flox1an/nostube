import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { extractBlossomHash } from '@/utils/video-event'
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

interface UseVideoServerAvailabilityParams {
  videoUrls: string[] // From video.urls
  videoHash?: string // SHA256 hash (video.x)
  videoExt?: string // File extension (optional, will be extracted from URLs if not provided)
  configServers?: BlossomServer[] // From app config
  userServers?: string[] // From user's NIP-63 list
}

interface UseVideoServerAvailabilityReturn {
  serverList: ServerInfo[] // All discovered servers
  serverAvailability: Map<string, ServerAvailability> // Status of each server
  checkAvailability: () => Promise<void> // Trigger availability checks
  isChecking: boolean // True when any checks in progress
}

/**
 * Extract server information from video URLs, config, and user preferences
 */
function extractServerList(
  videoUrls: string[],
  configServers?: BlossomServer[],
  userServers?: string[]
): ServerInfo[] {
  const serverMap = new Map<string, ServerInfo>()

  // Extract servers from video URLs
  for (const url of videoUrls) {
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
async function checkBlossomServer(
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

/**
 * Hook to manage video server availability information
 */
export function useVideoServerAvailability(
  params: UseVideoServerAvailabilityParams
): UseVideoServerAvailabilityReturn {
  const { videoUrls, videoHash, videoExt, configServers, userServers } = params

  // Extract server list (synchronous, no network requests)
  const serverList = useMemo(
    () => extractServerList(videoUrls, configServers, userServers),
    [videoUrls, configServers, userServers]
  )

  // State for server availability (only stores checked results, not initial unknown state)
  const [checkedAvailability, setCheckedAvailability] = useState<
    Map<string, Omit<ServerAvailability, 'url' | 'name' | 'source'>>
  >(new Map())

  const [isChecking, setIsChecking] = useState(false)

  // Merge serverList with checked availability results
  const serverAvailability = useMemo(() => {
    const merged = new Map<string, ServerAvailability>()
    serverList.forEach(server => {
      const checked = checkedAvailability.get(server.url)
      merged.set(server.url, {
        ...server,
        status: checked?.status || 'unknown',
        statusCode: checked?.statusCode,
        contentLength: checked?.contentLength,
        lastChecked: checked?.lastChecked,
      })
    })
    return merged
  }, [serverList, checkedAvailability])

  // Track abort controller for cleanup
  const abortControllerRef = useRef<AbortController | null>(null)

  // Track checked availability in a ref to avoid recreating callback
  const checkedAvailabilityRef = useRef(checkedAvailability)
  useEffect(() => {
    checkedAvailabilityRef.current = checkedAvailability
  }, [checkedAvailability])

  // Extract hash and extension from video URLs if not provided
  const hash = videoHash
  const ext = useMemo(() => {
    if (videoExt) return videoExt

    // Try to extract extension from URLs
    for (const url of videoUrls) {
      const { ext: urlExt } = extractBlossomHash(url)
      if (urlExt) return urlExt
    }

    return 'mp4' // default fallback
  }, [videoUrls, videoExt])

  // If no hash provided, try to extract from first valid URL
  const extractedHash = useMemo(() => {
    if (hash) return hash

    for (const url of videoUrls) {
      const { sha256 } = extractBlossomHash(url)
      if (sha256) return sha256
    }

    return undefined
  }, [hash, videoUrls])

  const finalHash = hash || extractedHash

  // Check availability function
  const checkAvailability = useCallback(async () => {
    if (!finalHash || !ext) {
      if (import.meta.env.DEV) {
        console.warn('[useVideoServerAvailability] Cannot check availability: missing hash or ext')
      }
      return
    }

    // Cancel any in-progress checks
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsChecking(true)

    // Check servers in parallel (skip recently checked ones)
    const now = Date.now()
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

    // Set all servers to 'checking' status
    setCheckedAvailability(prev => {
      const updated = new Map(prev)
      serverList.forEach(server => {
        const existing = prev.get(server.url)
        // Skip if checked within last 5 minutes
        if (existing?.lastChecked && now - existing.lastChecked < CACHE_DURATION) {
          return
        }
        updated.set(server.url, { status: 'checking' })
      })
      return updated
    })

    // Check each server in parallel
    const checks = serverList.map(async server => {
      const existing = checkedAvailabilityRef.current.get(server.url)
      // Skip if checked within last 5 minutes
      if (existing?.lastChecked && now - existing.lastChecked < CACHE_DURATION) {
        return
      }

      const result = await checkBlossomServer(server.url, finalHash, ext)

      // Update state with result
      setCheckedAvailability(prev => {
        const updated = new Map(prev)
        updated.set(server.url, result)
        return updated
      })
    })

    await Promise.allSettled(checks)

    setIsChecking(false)
    abortControllerRef.current = null
  }, [finalHash, ext, serverList])

  return {
    serverList,
    serverAvailability,
    checkAvailability,
    isChecking,
  }
}

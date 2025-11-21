import { useState, useMemo, useCallback } from 'react'
import type { VideoVariant } from '@/utils/video-event'
import type { BlossomServer } from '@/contexts/AppContext'
import { extractBlossomHash } from '@/utils/video-event'
import { normalizeServerUrl } from '@/lib/blossom-utils'

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

export interface VariantAvailability {
  variant: VideoVariant
  label: string // e.g., "Video 1", "Video 2", "Thumbnail"
  serverList: ServerInfo[]
  serverAvailability: Map<string, ServerAvailability>
  checkAvailability: () => Promise<void>
  isChecking: boolean
}

interface UseMultiVideoServerAvailabilityParams {
  videoVariants: VideoVariant[]
  thumbnailVariants: VideoVariant[]
  configServers?: BlossomServer[]
  userServers?: string[]
}

interface UseMultiVideoServerAvailabilityReturn {
  videoVariants: VariantAvailability[]
  thumbnailVariants: VariantAvailability[]
  allVariants: VariantAvailability[] // Combined for easy iteration
  checkAllAvailability: () => Promise<void>
  isAnyChecking: boolean
}

/**
 * Extract server information from video URLs, config, and user preferences
 */
function extractServerList(
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
 * Hook to manage server availability for multiple video variants and thumbnails
 */
export function useMultiVideoServerAvailability(
  params: UseMultiVideoServerAvailabilityParams
): UseMultiVideoServerAvailabilityReturn {
  const { videoVariants, thumbnailVariants, configServers, userServers } = params

  // Create availability state for each variant
  const [variantStates, setVariantStates] = useState<Map<number, Map<string, ServerAvailability>>>(
    new Map()
  )
  const [checkingStates, setCheckingStates] = useState<Map<number, boolean>>(new Map())

  // Combine all variants with metadata
  const allVariantsMetadata = useMemo(() => {
    const result: Array<{
      variant: VideoVariant
      label: string
      index: number
      isVideo: boolean
    }> = []

    videoVariants.forEach((variant, index) => {
      result.push({
        variant,
        label:
          videoVariants.length > 1
            ? `Video ${index + 1}${variant.quality ? ` (${variant.quality})` : ''}`
            : 'Video',
        index: result.length,
        isVideo: true,
      })
    })

    thumbnailVariants.forEach((variant, index) => {
      result.push({
        variant,
        label: thumbnailVariants.length > 1 ? `Thumbnail ${index + 1}` : 'Thumbnail',
        index: result.length,
        isVideo: false,
      })
    })

    return result
  }, [videoVariants, thumbnailVariants])

  // Extract server lists for each variant
  const variantServerLists = useMemo(() => {
    return allVariantsMetadata.map(({ variant }) => {
      const variantUrls = [variant.url, ...variant.fallbackUrls]
      return extractServerList(variantUrls, configServers, userServers)
    })
  }, [allVariantsMetadata, configServers, userServers])

  // Check availability for a specific variant
  const checkVariantAvailability = useCallback(
    async (variantIndex: number) => {
      const { variant } = allVariantsMetadata[variantIndex]
      const serverList = variantServerLists[variantIndex]

      if (!variant || !serverList) return

      // Extract hash and extension
      const { sha256 } = extractBlossomHash(variant.url)
      const ext =
        variant.url.split('.').pop() || (variant.mimeType?.includes('video') ? 'mp4' : 'jpg')

      if (!sha256) {
        if (import.meta.env.DEV) {
          console.warn(
            `[useMultiVideoServerAvailability] Cannot check availability: missing hash for variant ${variantIndex}`
          )
        }
        return
      }

      setCheckingStates(prev => new Map(prev).set(variantIndex, true))

      // Set all servers to 'checking' status
      setVariantStates(prev => {
        const updated = new Map(prev)
        const variantMap = new Map<string, ServerAvailability>()
        serverList.forEach(server => {
          variantMap.set(server.url, {
            ...server,
            status: 'checking',
          })
        })
        updated.set(variantIndex, variantMap)
        return updated
      })

      // Check each server in parallel
      const checks = serverList.map(async server => {
        const result = await checkBlossomServer(server.url, sha256, ext)

        // Update state with result
        setVariantStates(prev => {
          const updated = new Map(prev)
          const variantMap = new Map(updated.get(variantIndex))
          variantMap.set(server.url, {
            ...server,
            ...result,
          })
          updated.set(variantIndex, variantMap)
          return updated
        })
      })

      await Promise.allSettled(checks)

      setCheckingStates(prev => new Map(prev).set(variantIndex, false))
    },
    [allVariantsMetadata, variantServerLists]
  )

  // Check availability for all variants
  const checkAllAvailability = useCallback(async () => {
    await Promise.all(allVariantsMetadata.map((_, index) => checkVariantAvailability(index)))
  }, [allVariantsMetadata, checkVariantAvailability])

  // Build variant availability objects
  const variantAvailabilities = useMemo(() => {
    return allVariantsMetadata.map(({ variant, label, index }) => ({
      variant,
      label,
      serverList: variantServerLists[index] || [],
      serverAvailability: variantStates.get(index) || new Map(),
      checkAvailability: () => checkVariantAvailability(index),
      isChecking: checkingStates.get(index) || false,
    }))
  }, [
    allVariantsMetadata,
    variantServerLists,
    variantStates,
    checkingStates,
    checkVariantAvailability,
  ])

  // Split into video and thumbnail variants
  const videoVariantResults = variantAvailabilities.slice(0, videoVariants.length)
  const thumbnailVariantResults = variantAvailabilities.slice(videoVariants.length)

  // Check if any variant is currently checking
  const isAnyChecking = Array.from(checkingStates.values()).some(Boolean)

  return {
    videoVariants: videoVariantResults,
    thumbnailVariants: thumbnailVariantResults,
    allVariants: variantAvailabilities,
    checkAllAvailability,
    isAnyChecking,
  }
}

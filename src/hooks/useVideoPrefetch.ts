/**
 * useVideoPrefetch Hook
 *
 * Resolves a video's playback URL through the same pipeline the active player
 * uses (generateMediaUrls + kind 1063 discovery, cached by sha256), then GETs
 * the resolved URL to warm the browser's HTTP cache. When that video later
 * becomes active, the <video> element's byte request is served locally instead
 * of hitting the network — removing the fetch + demux latency from the
 * swipe-to-playback critical path.
 *
 * Best-effort: errors are swallowed. The active player's own failover still
 * handles real playback failures. Prefetch is skipped on Data Saver / 2g to
 * respect metered connections.
 */
import { useEffect, useRef } from 'react'
import { useMediaUrls } from './useMediaUrls'
import type { VideoEvent } from '@/utils/video-event'

interface UseVideoPrefetchOptions {
  video: VideoEvent | null
  enabled: boolean
}

// Same proxy config the shorts singleton uses; memoized at module scope so a
// neighbor resolves the identical URL the singleton will request when active.
const PROXY_CONFIG = { enabled: true }

// Minimal subset of the Network Information API (not in the TS DOM lib).
interface NetworkInformationLike {
  saveData?: boolean
  effectiveType?: string
}

function getNetworkInformation(): NetworkInformationLike | undefined {
  // `connection` is non-standard but widely supported; intersect rather than cast.
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection
}

function shouldSkipPrefetchForConnection(): boolean {
  const connection = getNetworkInformation()
  if (!connection) return false
  if (connection.saveData) return true
  const type = connection.effectiveType
  return type === 'slow-2g' || type === '2g'
}

export function useVideoPrefetch({ video, enabled }: UseVideoPrefetchOptions): void {
  // Resolve the neighbor URL ahead of time. This also primes the sha256-keyed
  // discovery cache, so when the singleton resolves the same video it is instant.
  const { currentUrl } = useMediaUrls({
    urls: video?.urls ?? [],
    mediaType: 'video',
    sha256: video?.x,
    kind: video?.kind,
    authorPubkey: video?.pubkey,
    proxyConfig: PROXY_CONFIG,
    enabled: enabled && !!video,
  })

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Cancel any in-flight prefetch from a previous URL/video.
    abortRef.current?.abort()

    if (!enabled || !currentUrl || shouldSkipPrefetchForConnection()) {
      abortRef.current = null
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    fetch(currentUrl, {
      method: 'GET',
      mode: 'cors',
      // Don't compete with the active video for bandwidth.
      priority: 'low',
      cache: 'default',
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) return undefined
        // Drain to completion so the full response is cached. A Blob is backed
        // by a file reference (not JS heap) and is discarded immediately.
        return response.blob()
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (import.meta.env.DEV) {
          console.debug('[useVideoPrefetch] prefetch failed for', currentUrl, error)
        }
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null
      })

    return () => {
      controller.abort()
    }
  }, [enabled, currentUrl])
}

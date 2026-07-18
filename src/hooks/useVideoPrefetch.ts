/**
 * useVideoPrefetch Hook
 *
 * Resolves a video's playback URL through the same pipeline the active player
 * uses (generateMediaUrls + kind 1063 discovery, cached by sha256), then GETs
 * the resolved URL and keeps the downloaded bytes as a Blob in a small
 * module-level cache. When that video later becomes active, the shorts
 * singleton can play the cached Blob directly via an object URL — a real,
 * guaranteed-instant local source rather than hoping the browser's HTTP cache
 * will serve the <video> element's range requests. This removes the buffering
 * gap from the swipe-to-playback critical path, which HTTP-cache warming
 * alone doesn't reliably do (range requests aren't always served from cache).
 *
 * Best-effort: errors are swallowed. The active player's own failover still
 * handles real playback failures. Prefetch is skipped on Data Saver / 2g to
 * respect metered connections.
 */
import { useEffect, useRef } from 'react'
import { useMediaUrls } from './useMediaUrls'
import type { VideoEvent } from '@/utils/video-event'

// Bounded to roughly the number of neighbors the shorts deck prefetches
// (next + previous) plus a little slack for fast successive swipes.
const MAX_CACHED_BLOBS = 3
const prefetchedBlobs = new Map<string, Blob>()

/** Returns the fully-downloaded Blob for a video URL, if it was prefetched. */
export function getPrefetchedVideoBlob(url: string): Blob | undefined {
  return prefetchedBlobs.get(url)
}

function cachePrefetchedBlob(url: string, blob: Blob): void {
  // Re-inserting refreshes recency (Map preserves insertion order).
  prefetchedBlobs.delete(url)
  prefetchedBlobs.set(url, blob)
  while (prefetchedBlobs.size > MAX_CACHED_BLOBS) {
    const oldestKey = prefetchedBlobs.keys().next().value
    if (oldestKey === undefined) break
    prefetchedBlobs.delete(oldestKey)
  }
}

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
        return response.blob()
      })
      .then(blob => {
        if (blob) cachePrefetchedBlob(currentUrl, blob)
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

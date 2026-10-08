/**
 * useVideoPrefetch Hook
 *
 * Resolves one upcoming (or previous) short's playback URL through the same
 * pipeline the active player uses (generateMediaUrls + kind 1063 discovery,
 * cached by sha256), then hands it to the shared video-prefetch cache to be
 * downloaded ahead of time. When that video later becomes active, the shorts
 * singleton plays the cached Blob directly via an object URL — a real,
 * guaranteed-instant local source — removing the network round-trip from the
 * swipe-to-playback critical path.
 *
 * The cache is content-addressed (keyed by sha256), so the neighbor prefetched
 * here and the source the singleton resolves when it activates agree on the
 * cache key even if discovery picks a different mirror URL for each.
 *
 * All the heavy lifting (concurrency limiting, memory budget, CORS handling)
 * lives in the shared manager; this hook is just the per-neighbor driver that
 * resolves a URL and registers/cancels interest.
 */
import { useEffect } from 'react'
import { useMediaUrls } from './useMediaUrls'
import { requestPrefetch, cancelPrefetch } from '@/lib/video-prefetch-cache'
import type { VideoEvent } from '@/utils/video-event'

// Re-exported so callers keep importing the lookup from one place.
export { getPrefetchedVideoBlob } from '@/lib/video-prefetch-cache'

interface UseVideoPrefetchOptions {
  video: VideoEvent | null
  enabled: boolean
  /** Lower = fetched sooner. Distance from the active video (1 = next, 2 = next+1). */
  priority?: number
}

// Same proxy config the shorts singleton uses; memoized at module scope so a
// neighbor resolves the identical URL the singleton will request when active.
const PROXY_CONFIG = { enabled: true }

export function useVideoPrefetch({ video, enabled, priority = 1 }: UseVideoPrefetchOptions): void {
  // Resolve the neighbor URL ahead of time. This also primes the sha256-keyed
  // discovery cache, so when the singleton resolves the same video it is instant.
  const { ladder } = useMediaUrls({
    urls: video?.urls ?? [],
    mediaType: 'video',
    sha256: video?.x,
    kind: video?.kind,
    authorPubkey: video?.pubkey,
    proxyConfig: PROXY_CONFIG,
    enabled: enabled && !!video,
  })
  const currentUrl = ladder.currentUrl

  const sha256 = video?.x

  useEffect(() => {
    if (!enabled || !currentUrl) return

    requestPrefetch({ sha256, url: currentUrl, priority })

    return () => {
      cancelPrefetch({ sha256, url: currentUrl })
    }
  }, [enabled, currentUrl, sha256, priority])
}

import { useCallback, useMemo } from 'react'
import { useAppContextSafe } from '@/hooks/useAppContext'
import { useProxyHealthStore } from '@/stores/proxyHealthStore'
import {
  type BlossomThumbnailOptions,
  ensureFileExtension,
  imageProxy as buildAvatarUrl,
  imageProxyInline as buildInlineUrl,
  imageProxyVideoPreview as buildPreviewUrl,
  imageProxyVideoThumbnail as buildVideoThumbnailUrl,
} from '@/lib/utils'

/**
 * Builder functions returned by {@link useImageProxy}. Each returns the URL to put on
 * `<img src>`. When the proxy is known-down (`isProxyDown === true`), every builder skips
 * the proxy and returns the raw original URL (or an empty string for cases the proxy is
 * the only way to derive a thumbnail, e.g. extracting a frame from a video).
 */

export type BlossomThumbnailContext = Pick<BlossomThumbnailOptions, 'authorPubkey' | 'fallbackUrls'>
export interface ImageProxyHelpers {
  /** Standard square avatar — `imageProxy(url)` style, 80×80 WebP via proxy. */
  avatar: (url: string | null | undefined, context?: BlossomThumbnailContext) => string
  /** Resized preview/thumbnail, fit 480×480 WebP via proxy. */
  preview: (
    url: string | null | undefined,
    mimeType?: string,
    context?: BlossomThumbnailContext
  ) => string
  /** Inline image (comments, notes), fit 400×400 WebP via proxy. */
  inline: (url: string | null | undefined, context?: BlossomThumbnailContext) => string
  /**
   * Frame extracted from a video URL by the proxy. Only the proxy can do this — if the
   * proxy is down we have no way to derive a still frame from a video URL, so the function
   * returns an empty string. Callers should treat that as "no thumbnail available".
   */
  videoThumbnail: (videoUrl: string | null | undefined, context?: BlossomThumbnailContext) => string
  /** True iff the circuit breaker has tripped or a probe declared the proxy unreachable. */
  isProxyDown: boolean
  /** Call from `<img onError>` when a proxy URL fails. Trips the breaker after N. */
  reportFailure: (rawUrl: string) => void
  /** Call from `<img onLoad>` when a proxy URL succeeds. Resets the failure window. */
  reportSuccess: () => void
}

/** Strip any imgproxy prefix from a previously-built URL so we can return the raw original. */
function rawFromProxyUrl(url: string | null | undefined): string {
  if (!url) return ''
  // Already a data URL or relative path — return as-is.
  if (url.startsWith('data:') || url.startsWith('/')) return url
  // Pattern: <base>/insecure/<options>/plain/<encoded-original>
  const marker = '/plain/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const encoded = url.slice(idx + marker.length)
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

/**
 * Returns image-URL builders that transparently bypass the imgproxy when it's unhealthy.
 *
 * Callers should:
 * - Use the returned builders instead of importing `imageProxy*` from `@/lib/utils` directly.
 * - Pass `onError={() => reportFailure(rawUrl)}` and `onLoad={reportSuccess}` on every
 *   `<img>` whose `src` came through the proxy. This feeds the circuit breaker so the
 *   first few failures across the page flip every other tile to the raw fallback.
 */
export function useImageProxy(): ImageProxyHelpers {
  const config = useAppContextSafe()?.config
  const status = useProxyHealthStore(s => s.status)
  const recordFailure = useProxyHealthStore(s => s.recordFailure)
  const recordSuccess = useProxyHealthStore(s => s.recordSuccess)

  const base = config?.thumbResizeServerUrl
  const proxyDown = status === 'down' || !base
  const mirrorServers = useMemo(
    () =>
      config?.blossomServers
        ?.filter(server => server.tags.includes('mirror'))
        .map(server => server.url) ?? [],
    [config?.blossomServers]
  )
  const withConfiguredMirrors = useCallback(
    (context?: BlossomThumbnailContext): BlossomThumbnailOptions => ({
      ...context,
      mirrorServers,
    }),
    [mirrorServers]
  )

  const avatar = useCallback(
    (url: string | null | undefined, context?: BlossomThumbnailContext) => {
      if (!url) return ''
      if (proxyDown) return url
      return buildAvatarUrl(url, base, withConfiguredMirrors(context))
    },
    [proxyDown, base, withConfiguredMirrors]
  )

  const preview = useCallback(
    (url: string | null | undefined, mimeType?: string, context?: BlossomThumbnailContext) => {
      if (!url) return ''
      const withExt = mimeType ? ensureFileExtension(url, mimeType) : url
      if (proxyDown) return withExt
      return buildPreviewUrl(withExt, base, withConfiguredMirrors(context))
    },
    [proxyDown, base, withConfiguredMirrors]
  )

  const inline = useCallback(
    (url: string | null | undefined, context?: BlossomThumbnailContext) => {
      if (!url) return ''
      if (proxyDown) return url
      return buildInlineUrl(url, base, withConfiguredMirrors(context))
    },
    [proxyDown, base, withConfiguredMirrors]
  )

  const videoThumbnail = useCallback(
    (videoUrl: string | null | undefined, context?: BlossomThumbnailContext) => {
      if (!videoUrl) return ''
      // Only the proxy can derive a still frame from a video URL. Without it, give up.
      if (proxyDown) return ''
      return buildVideoThumbnailUrl(videoUrl, base, withConfiguredMirrors(context))
    },
    [proxyDown, base, withConfiguredMirrors]
  )

  const reportFailure = useCallback(
    (rawUrl: string) => {
      // Only feed the breaker when the failed URL was actually going through the proxy.
      if (proxyDown) return
      const raw = rawFromProxyUrl(rawUrl)
      recordFailure(raw || rawUrl)
    },
    [proxyDown, recordFailure]
  )

  return useMemo<ImageProxyHelpers>(
    () => ({
      avatar,
      preview,
      inline,
      videoThumbnail,
      isProxyDown: proxyDown,
      reportFailure,
      reportSuccess: recordSuccess,
    }),
    [avatar, preview, inline, videoThumbnail, proxyDown, reportFailure, recordSuccess]
  )
}

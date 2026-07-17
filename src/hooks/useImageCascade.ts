import { useCallback, useEffect, useMemo, useState } from 'react'
import { useImageProxy } from '@/hooks/useImageProxy'
import { isAllowedEventMediaUrl } from '@/lib/media-url-policy'

/**
 * The variant of proxy URL to build when the proxy is healthy and the image hasn't
 * fallen back to raw yet. See {@link useImageProxy} for the URL shapes each builds.
 */
export type ImageCascadeVariant = 'preview' | 'inline' | 'avatar'

export interface ImageCascadeInput {
  /** Raw original image URL. The primary candidate for display. */
  src: string | null | undefined
  /**
   * Raw video URL used as a *last-resort* fallback when both the proxied image and the
   * raw image fail. The proxy can extract a still frame from a video URL — if the proxy
   * is down, this fallback is skipped because client-side frame extraction isn't viable.
   */
  videoUrl?: string | null
  /** Which proxy builder to use. Defaults to `'preview'` (480×480 WebP). */
  variant?: ImageCascadeVariant
  /** Optional MIME type used to repair URLs that lack a file extension. */
  mimeType?: string
}

export interface ImageCascadeResult {
  /** URL to put on `<img src>`. `null` when every fallback is exhausted. */
  src: string | null
  /** Pass to `<img onError>`. Advances to the next fallback stage. */
  onError: () => void
  /** Pass to `<img onLoad>`. Resets the global proxy circuit-breaker counter. */
  onLoad: () => void
  /** True when no candidate URL remains. Callers render their own placeholder UI. */
  exhausted: boolean
  /** Which stage of the cascade we're currently rendering. */
  stage: 'proxy' | 'raw' | 'video-frame' | 'exhausted'
}

type Stage = ImageCascadeResult['stage']

/**
 * Resilient image-loading cascade.
 *
 * Stages (each `onError` advances to the next, each `onLoad` resets the breaker):
 * 1. `proxy`       — proxy-built URL of the raw image (or the raw URL itself if the
 *                    proxy is globally known-down).
 * 2. `raw`         — the raw image URL bypassing the proxy. Catches the case where the
 *                    proxy only struggles with this specific URL but the origin works.
 * 3. `video-frame` — proxy-extracted still from `videoUrl`. Skipped entirely if the proxy
 *                    is down (no client-side equivalent).
 * 4. `exhausted`   — `src === null`; caller renders a placeholder.
 *
 * Components combine this with their own blurhash/placeholder/audio-fallback UI.
 */
export function useImageCascade(input: ImageCascadeInput): ImageCascadeResult {
  const variant: ImageCascadeVariant = input.variant ?? 'preview'
  const rawImage =
    input.src &&
    (isAllowedEventMediaUrl(input.src) ||
      input.src.startsWith('blob:') ||
      input.src.startsWith('data:'))
      ? input.src
      : null
  const videoUrl =
    input.videoUrl &&
    (isAllowedEventMediaUrl(input.videoUrl) ||
      input.videoUrl.startsWith('blob:') ||
      input.videoUrl.startsWith('data:'))
      ? input.videoUrl
      : null
  const proxy = useImageProxy()

  // Initial stage: skip 'proxy' when there's no image at all but a video might give us one.
  // Skip everything to 'exhausted' when there's no candidate of any kind.
  const initialStage: Stage = useMemo(() => {
    if (rawImage) return 'proxy'
    if (videoUrl && !proxy.isProxyDown) return 'video-frame'
    return 'exhausted'
  }, [rawImage, videoUrl, proxy.isProxyDown])

  const [stage, setStage] = useState<Stage>(initialStage)

  // The src space depends on rawImage/videoUrl. If those change (e.g. parent re-keys),
  // reset to the new initial stage so we don't stay stuck on a stale failure.
  useEffect(() => {
    setStage(initialStage)
  }, [initialStage, rawImage, videoUrl])

  const src = useMemo<string | null>(() => {
    switch (stage) {
      case 'proxy': {
        if (!rawImage) return null
        if (variant === 'inline') return proxy.inline(rawImage)
        if (variant === 'avatar') return proxy.avatar(rawImage)
        return proxy.preview(rawImage, input.mimeType)
      }
      case 'raw':
        return rawImage
      case 'video-frame':
        return videoUrl ? proxy.videoThumbnail(videoUrl) : null
      case 'exhausted':
        return null
    }
  }, [stage, rawImage, videoUrl, variant, input.mimeType, proxy])

  const onError = useCallback(() => {
    setStage(current => {
      // Feed the breaker only when the failure was actually a proxy URL.
      if (current === 'proxy' && !proxy.isProxyDown && rawImage) {
        proxy.reportFailure(rawImage)
      }
      if (current === 'proxy') {
        // Raw image as second attempt — but if there isn't one, skip ahead.
        if (rawImage) return 'raw'
        return videoUrl && !proxy.isProxyDown ? 'video-frame' : 'exhausted'
      }
      if (current === 'raw') {
        return videoUrl && !proxy.isProxyDown ? 'video-frame' : 'exhausted'
      }
      return 'exhausted'
    })
  }, [proxy, rawImage, videoUrl])

  // onLoad is a stable zustand action via the hook — pass it straight through.
  const onLoad = proxy.reportSuccess

  return { src, onError, onLoad, exhausted: stage === 'exhausted', stage }
}

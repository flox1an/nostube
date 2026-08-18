import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppContextSafe } from '@/hooks/useAppContext'
import { parseBlossomUrl } from '@/lib/blossom-url'
import { isAllowedEventMediaUrl } from '@/lib/media-url-policy'
import {
  presetThumbnailUrl,
  insecureThumbnailUrl,
  type PresetThumbnailPreset,
} from '@/lib/preset-thumbnail-url'

export type ImageCascadeVariant = 'preview' | 'inline' | 'avatar'

export interface ImageCascadeInput {
  /** Raw image candidate. Blossom-hash URLs use the fixed preset route; any other URL uses the legacy `/insecure/` directive route. */
  src: string | null | undefined
  /** Raw video candidate from which imgproxy may create a still frame. */
  videoUrl?: string | null
  variant?: ImageCascadeVariant
  /** Override for embed cards; normal UI derives the preset from variant. */
  preset?: PresetThumbnailPreset
  /** Media author's pubkey, sent as `as=` so the proxy can look up their Blossom server list. */
  authorPubkey?: string | null
  /** Retained for callers whose source selection uses MIME metadata. */
  mimeType?: string
}

export interface ImageCascadeResult {
  src: string | null
  onError: () => void
  onLoad: () => void
  exhausted: boolean
  stage: 'proxied' | 'raw' | 'video-frame' | 'exhausted'
}

type Stage = ImageCascadeResult['stage']

/**
 * Image loading cascade:
 * 1. a proxied URL — the fixed image-proxy preset for hash-addressed Blossom media, or the
 *    legacy unsigned `/insecure/` directive route for any other source URL;
 * 2. the raw image when the proxied URL fails;
 * 3. a proxied frame from the Blossom or direct video URL;
 * 4. the caller's placeholder.
 */
export function useImageCascade(input: ImageCascadeInput): ImageCascadeResult {
  const imgproxyBaseUrl = useAppContextSafe()?.config.imgproxyBaseUrl
  const variant = input.variant ?? 'preview'
  const preset: PresetThumbnailPreset =
    input.preset ?? (variant === 'avatar' ? 'profile-avatar-v1' : 'feed-preview-v1')
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
  const imageMedia = useMemo(() => (rawImage ? parseBlossomUrl(rawImage) : undefined), [rawImage])
  const videoMedia = useMemo(() => (videoUrl ? parseBlossomUrl(videoUrl) : undefined), [videoUrl])
  const authorPubkey = input.authorPubkey ?? undefined

  // blob:/data: URLs are local-only and never reach imgproxy in either mode.
  const isProxyable = (url: string) => !url.startsWith('blob:') && !url.startsWith('data:')

  const proxiedImage = useMemo(() => {
    if (!rawImage || !isProxyable(rawImage)) return rawImage
    if (imageMedia?.sha256) {
      return presetThumbnailUrl(imgproxyBaseUrl, preset, imageMedia.sha256, {
        extension: imageMedia.ext,
        serverHints: [imageMedia.host],
        authorPubkey,
      })
    }
    return insecureThumbnailUrl(imgproxyBaseUrl, preset, rawImage)
  }, [imgproxyBaseUrl, imageMedia, preset, rawImage, authorPubkey])

  const proxiedVideoFrame = useMemo(() => {
    if (!videoUrl || !isProxyable(videoUrl)) return null
    if (videoMedia?.sha256) {
      return presetThumbnailUrl(imgproxyBaseUrl, preset, videoMedia.sha256, {
        extension: videoMedia.ext,
        serverHints: [videoMedia.host],
        authorPubkey,
      })
    }
    return insecureThumbnailUrl(imgproxyBaseUrl, preset, videoUrl)
  }, [imgproxyBaseUrl, preset, videoMedia, videoUrl, authorPubkey])

  const videoFrameAvailable = Boolean(proxiedVideoFrame)

  const initialStage: Stage = useMemo(() => {
    if (rawImage) return isProxyable(rawImage) ? 'proxied' : 'raw'
    if (videoFrameAvailable) return 'video-frame'
    return 'exhausted'
  }, [rawImage, videoFrameAvailable])

  const [stage, setStage] = useState<Stage>(initialStage)

  useEffect(() => {
    setStage(initialStage)
  }, [initialStage, rawImage, videoUrl])

  const effectiveStage: Stage =
    stage === 'video-frame' && !videoFrameAvailable ? 'exhausted' : stage

  const src = useMemo<string | null>(() => {
    switch (effectiveStage) {
      case 'proxied':
        return proxiedImage
      case 'raw':
        return rawImage
      case 'video-frame':
        return proxiedVideoFrame
      case 'exhausted':
        return null
    }
  }, [effectiveStage, proxiedImage, proxiedVideoFrame, rawImage])

  const onError = useCallback(() => {
    setStage(current => {
      if (current === 'proxied' && rawImage) return 'raw'
      if ((current === 'proxied' || current === 'raw') && videoFrameAvailable) {
        return 'video-frame'
      }
      return 'exhausted'
    })
  }, [rawImage, videoFrameAvailable])

  const onLoad = useCallback(() => {}, [])

  return {
    src,
    onError,
    onLoad,
    exhausted: effectiveStage === 'exhausted',
    stage: effectiveStage,
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppContextSafe } from '@/hooks/useAppContext'
import { parseBlossomUrl } from '@/lib/blossom-url'
import { isAllowedEventMediaUrl } from '@/lib/media-url-policy'
import { presetThumbnailUrl, type PresetThumbnailPreset } from '@/lib/preset-thumbnail-url'

export type ImageCascadeVariant = 'preview' | 'inline' | 'avatar'

export interface ImageCascadeInput {
  /** Raw image candidate. Hash-addressed Blossom URLs use the fixed image-proxy preset. */
  src: string | null | undefined
  /** Raw Blossom video candidate from which imgproxy may create a still frame. */
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
  stage: 'preset' | 'raw' | 'video-frame' | 'exhausted'
}

type Stage = ImageCascadeResult['stage']

/**
 * Image loading cascade:
 * 1. a fixed image-proxy preset URL for hash-addressed Blossom media;
 * 2. the raw image when the preset URL fails;
 * 3. a fixed-preset frame from the Blossom video;
 * 4. the caller's placeholder.
 *
 * Arbitrary remote URLs are never sent to imgproxy.
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
  const presetImage = useMemo(
    () =>
      imageMedia?.sha256
        ? presetThumbnailUrl(imgproxyBaseUrl, preset, imageMedia.sha256, {
            extension: imageMedia.ext,
            serverHints: [imageMedia.server],
            authorPubkey,
          })
        : rawImage,
    [imgproxyBaseUrl, imageMedia, preset, rawImage, authorPubkey]
  )
  const presetVideoFrame = useMemo(
    () =>
      videoMedia?.sha256
        ? presetThumbnailUrl(imgproxyBaseUrl, preset, videoMedia.sha256, {
            extension: videoMedia.ext,
            serverHints: [videoMedia.server],
            authorPubkey,
          })
        : null,
    [imgproxyBaseUrl, preset, videoMedia, authorPubkey]
  )
  const imageUsesPreset = Boolean(imageMedia?.sha256)
  const videoFrameAvailable = Boolean(presetVideoFrame)

  const initialStage: Stage = useMemo(() => {
    if (rawImage) return imageUsesPreset ? 'preset' : 'raw'
    if (videoFrameAvailable) return 'video-frame'
    return 'exhausted'
  }, [imageUsesPreset, rawImage, videoFrameAvailable])

  const [stage, setStage] = useState<Stage>(initialStage)

  useEffect(() => {
    setStage(initialStage)
  }, [initialStage, rawImage, videoUrl])

  const effectiveStage: Stage =
    stage === 'video-frame' && !videoFrameAvailable ? 'exhausted' : stage

  const src = useMemo<string | null>(() => {
    switch (effectiveStage) {
      case 'preset':
        return presetImage
      case 'raw':
        return rawImage
      case 'video-frame':
        return presetVideoFrame
      case 'exhausted':
        return null
    }
  }, [effectiveStage, presetImage, presetVideoFrame, rawImage])

  const onError = useCallback(() => {
    setStage(current => {
      if (current === 'preset' && rawImage) return 'raw'
      if ((current === 'preset' || current === 'raw') && videoFrameAvailable) {
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

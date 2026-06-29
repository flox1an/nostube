import { useMemo, type RefObject } from 'react'
import type { VideoVariant } from '@/utils/video-event'
import { useHls } from '../hooks/useHls'
import { useDash } from '../hooks/useDash'
import type { PlaybackEngine, PlaybackEngineMode, QualityOption } from './types'

const EMPTY_QUALITY_OPTIONS: QualityOption[] = []
const NOOP_SELECT = () => {}

/**
 * Derives a human label for a native Nostr video variant: prefers the explicit
 * `quality` tag, then the height from `dimensions` ("1280x720" -> "720p").
 */
export function qualityLabelFromVariant(variant: VideoVariant, fallback: string): string {
  if (variant.quality) return variant.quality
  const height = variant.dimensions?.match(/x(\d+)/)?.[1]
  return height ? `${height}p` : fallback
}

/**
 * Native `<video>`/`<audio>` playback driven by Nostr video variants. The
 * element source is the resolved media URL; quality is the selected variant.
 */
function useNativeEngine(
  videoUrl: string | null,
  videoVariants: VideoVariant[] | undefined,
  selectedVariantIndex: number,
  handleVariantChange: (index: number) => void
): PlaybackEngine {
  const qualityOptions = useMemo(
    () =>
      (videoVariants ?? []).map((variant, index) => ({
        id: index,
        label: qualityLabelFromVariant(variant, `Quality ${index + 1}`),
        contributorPubkey: variant.contributorPubkey,
      })),
    [videoVariants]
  )

  return {
    mode: 'native',
    elementSrc: videoUrl ?? undefined,
    managedSource: false,
    loading: false,
    error: null,
    qualityOptions,
    selectedQuality: selectedVariantIndex,
    activeQualityLabel: null,
    selectQuality: handleVariantChange,
  }
}

/**
 * HLS playback via hls.js. The adapter manages the media element source itself
 * (MSE), so `elementSrc` is always undefined and `managedSource` is true.
 * Surfaces the manifest's renditions as quality options plus an "Auto" entry.
 */
function useHlsEngine(
  videoRef: RefObject<HTMLMediaElement | null>,
  videoUrl: string | null,
  isHlsSource: boolean,
  authorPubkey: string | undefined,
  eventId: string | undefined
): PlaybackEngine {
  const { levels, currentLevel, activeLevel, setLevel, isLoading, error } = useHls(
    videoRef,
    videoUrl,
    isHlsSource,
    authorPubkey,
    eventId,
    'never'
  )

  const activeQualityLabel = useMemo(
    () =>
      activeLevel === null
        ? null
        : (levels.find(level => level.index === activeLevel)?.label ?? null),
    [activeLevel, levels]
  )

  const qualityOptions = useMemo<QualityOption[]>(
    () => [
      {
        id: -1,
        label: 'Auto',
        description: activeQualityLabel ? `Currently ${activeQualityLabel}` : undefined,
      },
      ...levels.map(level => ({ id: level.index, label: level.label })),
    ],
    [levels, activeQualityLabel]
  )

  return {
    mode: 'hls',
    elementSrc: undefined,
    managedSource: true,
    loading: isLoading,
    error,
    qualityOptions,
    selectedQuality: currentLevel,
    activeQualityLabel,
    selectQuality: setLevel,
  }
}

/**
 * DASH playback via dash.js. The adapter manages the media element source
 * itself (MSE). Quality is ABR-controlled by dash.js and not yet surfaced as
 * selectable options.
 */
function useDashEngine(
  videoRef: RefObject<HTMLMediaElement | null>,
  videoUrl: string | null,
  isDashSource: boolean,
  autoPlay: boolean,
  onError: (message: string) => void
): PlaybackEngine {
  const { isLoading, error } = useDash(videoRef, videoUrl, isDashSource, autoPlay, onError)

  return {
    mode: 'dash',
    elementSrc: undefined,
    managedSource: true,
    loading: isLoading,
    error,
    qualityOptions: EMPTY_QUALITY_OPTIONS,
    selectedQuality: undefined,
    activeQualityLabel: null,
    selectQuality: NOOP_SELECT,
  }
}

function baseMimeType(mime: string): string {
  return mime.split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * Resolves the active playback mode from the source mime, the candidate URLs,
 * and the resolved playable URL. HLS takes precedence over DASH (a source is
 * one or the other in practice).
 */
export function resolvePlaybackMode(
  mime: string,
  effectiveUrls: string[],
  videoUrl: string | null
): PlaybackEngineMode {
  const baseMime = baseMimeType(mime)
  const hasHlsSource =
    baseMime === 'application/vnd.apple.mpegurl' || effectiveUrls.some(url => url.endsWith('.m3u8'))
  const hasDashSource =
    baseMime === 'application/dash+xml' || effectiveUrls.some(url => url.endsWith('.mpd'))
  if (hasHlsSource || videoUrl?.endsWith('.m3u8')) return 'hls'
  if (hasDashSource || videoUrl?.endsWith('.mpd')) return 'dash'
  return 'native'
}

interface UsePlaybackEngineOptions {
  videoRef: RefObject<HTMLMediaElement | null>
  videoUrl: string | null
  mime: string
  effectiveUrls: string[]
  videoVariants: VideoVariant[] | undefined
  selectedVariantIndex: number
  handleVariantChange: (index: number) => void
  authorPubkey?: string
  eventId?: string
  autoPlay: boolean
  onError: (message: string) => void
}

/**
 * Selects and returns the active playback adapter for the current source.
 *
 * All three adapters are invoked unconditionally (React's rules-of-hooks), but
 * each gates itself on its mode so only the active one touches the media
 * element — mirroring how VideoPlayer previously called `useHls` and `useDash`
 * side by side.
 */
export function usePlaybackEngine({
  videoRef,
  videoUrl,
  mime,
  effectiveUrls,
  videoVariants,
  selectedVariantIndex,
  handleVariantChange,
  authorPubkey,
  eventId,
  autoPlay,
  onError,
}: UsePlaybackEngineOptions): PlaybackEngine {
  const mode = resolvePlaybackMode(mime, effectiveUrls, videoUrl)

  const native = useNativeEngine(videoUrl, videoVariants, selectedVariantIndex, handleVariantChange)
  const hls = useHlsEngine(videoRef, videoUrl, mode === 'hls', authorPubkey, eventId)
  const dash = useDashEngine(videoRef, videoUrl, mode === 'dash', autoPlay, onError)

  if (mode === 'hls') return hls
  if (mode === 'dash') return dash
  return native
}

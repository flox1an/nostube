import { createRef } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoVariant } from '@/utils/video-event'
import { PlaybackUrlLadder } from '@/lib/playback-url-ladder'
import {
  usePlaybackEngine,
  resolvePlaybackMode,
  qualityLabelFromVariant,
} from './usePlaybackEngine'

vi.mock('../hooks/useHls', () => ({
  useHls: vi.fn(() => ({
    levels: [],
    currentLevel: -1,
    activeLevel: null,
    setLevel: vi.fn(),
    isLoading: false,
    error: null,
  })),
}))
vi.mock('../hooks/useDash', () => ({
  useDash: vi.fn(() => ({ isLoading: false, error: null })),
}))

// Imported after vi.mock so the mocked implementations are in hand.
import { useHls } from '../hooks/useHls'

const videoRef = createRef<HTMLMediaElement>()

const baseOptions = {
  videoRef,
  mime: 'video/mp4',
  effectiveUrls: ['https://cdn.example.com/video.mp4'],
  videoVariants: undefined,
  selectedVariantIndex: 0,
  handleVariantChange: vi.fn(),
  autoPlay: true,
  onError: vi.fn(),
}

describe('resolvePlaybackMode', () => {
  it('detects HLS by mime type', () => {
    expect(resolvePlaybackMode('application/vnd.apple.mpegurl', ['https://cdn/x.m3u8'], null)).toBe(
      'hls'
    )
  })

  it('detects HLS by the resolved url extension', () => {
    expect(resolvePlaybackMode('video/mp4', ['https://cdn/any'], 'https://cdn/x.m3u8')).toBe('hls')
  })

  it('detects DASH by .mpd', () => {
    expect(
      resolvePlaybackMode('application/dash+xml', ['https://cdn/x.mpd'], 'https://cdn/x.mpd')
    ).toBe('dash')
  })

  it('defaults to native for plain media', () => {
    expect(resolvePlaybackMode('video/mp4', ['https://cdn/x.mp4'], 'https://cdn/x.mp4')).toBe(
      'native'
    )
  })

  it('prefers HLS when both manifest kinds are present', () => {
    expect(resolvePlaybackMode('', ['https://cdn/a.m3u8', 'https://cdn/b.mpd'], null)).toBe('hls')
  })
})

describe('qualityLabelFromVariant', () => {
  const variant = (overrides: Partial<VideoVariant>): VideoVariant =>
    ({ url: 'u', fallbackUrls: [], ...overrides }) as VideoVariant

  it('uses the explicit quality tag', () => {
    expect(qualityLabelFromVariant(variant({ quality: '720p' }), 'fallback')).toBe('720p')
  })

  it('derives the height from dimensions', () => {
    expect(qualityLabelFromVariant(variant({ dimensions: '1280x720' }), 'fallback')).toBe('720p')
  })

  it('falls back when no quality or dimensions are present', () => {
    expect(qualityLabelFromVariant(variant({}), 'Quality 1')).toBe('Quality 1')
  })
})

describe('usePlaybackEngine adapters', () => {
  beforeEach(() => {
    vi.mocked(useHls).mockReturnValue({
      levels: [],
      currentLevel: -1,
      activeLevel: null,
      setLevel: vi.fn(),
      isLoading: false,
      error: null,
    })
  })

  it('native adapter maps Nostr variants to quality options and owns the element src', () => {
    const variants: VideoVariant[] = [
      { url: 'https://cdn/a.mp4', dimensions: '1280x720', fallbackUrls: [] },
      {
        url: 'https://cdn/b.mp4',
        dimensions: '854x480',
        fallbackUrls: [],
        contributorPubkey: 'alice',
      },
    ]

    const { result } = renderHook(() =>
      usePlaybackEngine({
        ...baseOptions,
        videoUrl: 'https://cdn/a.mp4',
        videoVariants: variants,
      })
    )

    expect(result.current.mode).toBe('native')
    expect(result.current.managedSource).toBe(false)
    expect(result.current.elementSrc).toBe('https://cdn/a.mp4')
    expect(result.current.qualityOptions).toHaveLength(2)
    expect(result.current.qualityOptions[0]).toEqual(
      expect.objectContaining({ id: 0, label: '720p' })
    )
    expect(result.current.qualityOptions[1]).toEqual(
      expect.objectContaining({ id: 1, label: '480p', contributorPubkey: 'alice' })
    )
    expect(result.current.selectedQuality).toBe(0)
  })

  it('hls adapter manages the source, prepends an Auto option, and surfaces the active rendition', () => {
    vi.mocked(useHls).mockReturnValue({
      levels: [
        { index: 0, height: 720, width: 1280, bitrate: 2000000, label: '720p' },
        { index: 1, height: 480, width: 854, bitrate: 1000000, label: '480p' },
      ],
      currentLevel: -1,
      activeLevel: 0,
      setLevel: vi.fn(),
      isLoading: false,
      error: null,
    })
    const ladder = new PlaybackUrlLadder({
      urls: ['https://cdn/x.m3u8'],
      blossomServers: [],
      mediaType: 'video',
    })

    const { result } = renderHook(() =>
      usePlaybackEngine({
        ...baseOptions,
        videoUrl: 'https://cdn/x.m3u8',
        mime: 'application/vnd.apple.mpegurl',
        effectiveUrls: ['https://cdn/x.m3u8'],
        ladder,
      })
    )

    expect(result.current.mode).toBe('hls')
    expect(result.current.managedSource).toBe(true)
    expect(result.current.elementSrc).toBeUndefined()
    expect(result.current.qualityOptions).toEqual([
      { id: -1, label: 'Auto', description: 'Currently 720p' },
      { id: 0, label: '720p' },
      { id: 1, label: '480p' },
    ])
    expect(result.current.selectedQuality).toBe(-1)
    expect(result.current.activeQualityLabel).toBe('720p')
    expect(useHls).toHaveBeenLastCalledWith(
      videoRef,
      'https://cdn/x.m3u8',
      true,
      ladder,
      undefined,
      undefined,
      'never'
    )
  })

  it('dash adapter manages the source and exposes no selectable quality', () => {
    const { result } = renderHook(() =>
      usePlaybackEngine({
        ...baseOptions,
        videoUrl: 'https://cdn/x.mpd',
        mime: 'application/dash+xml',
        effectiveUrls: ['https://cdn/x.mpd'],
      })
    )

    expect(result.current.mode).toBe('dash')
    expect(result.current.managedSource).toBe(true)
    expect(result.current.elementSrc).toBeUndefined()
    expect(result.current.qualityOptions).toEqual([])
    expect(result.current.selectedQuality).toBeUndefined()
  })
})

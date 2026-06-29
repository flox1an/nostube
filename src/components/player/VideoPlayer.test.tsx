import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPlayer } from './VideoPlayer'

vi.mock('@/hooks', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/useMediaUrls', () => ({
  useMediaUrls: ({ urls }: { urls: string[] }) => ({
    urls,
    isLoading: false,
    isDiscovering: false,
    error: null,
    currentIndex: 0,
    currentUrl: urls[0] ?? null,
    moveToNext: vi.fn(),
    reset: vi.fn(),
    hasMore: false,
  }),
}))

vi.mock('@/workers/blurhashDataURL', () => ({
  blurHashToDataURL: () => null,
}))

vi.mock('../PlayPauseOverlay', () => ({
  PlayPauseOverlay: () => null,
}))

vi.mock('./ControlBar', () => ({
  ControlBar: () => null,
}))

vi.mock('./LoadingSpinner', () => ({
  LoadingSpinner: () => null,
}))

vi.mock('./TouchOverlay', () => ({
  TouchOverlay: () => null,
}))

vi.mock('./SeekIndicator', () => ({
  SeekIndicator: () => null,
}))

vi.mock('./engines', () => ({
  usePlaybackEngine: () => ({
    mode: 'native',
    elementSrc: undefined,
    managedSource: false,
    loading: false,
    error: null,
    qualityOptions: [],
    selectedQuality: 0,
    activeQualityLabel: null,
    selectQuality: () => {},
  }),
}))
vi.mock('./hooks', () => ({
  usePlayerState: () => ({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    volume: 1,
    isMuted: false,
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    bufferedPercentage: 0,
    isBuffering: false,
    playbackRate: 1,
    setPlaybackRate: vi.fn(),
  }),
  useControlsVisibility: () => ({
    isVisible: true,
    showControls: vi.fn(),
  }),
  useSeekAccumulator: () => ({
    addSeek: vi.fn(),
    accumulatedTime: 0,
    isAccumulating: false,
    direction: null,
  }),
  useAdaptiveQuality: () => undefined,
  useValidatedTextTracks: (tracks: unknown[]) => ({
    validatedTracks: tracks,
  }),
  useVideoVariantSelector: ({ urls, sha256 }: { urls: string[]; sha256?: string }) => ({
    selectedVariantIndex: 0,
    effectiveUrls: urls,
    effectiveSha256: sha256,
    handleVariantChange: vi.fn(),
  }),
  useMediaSession: () => undefined,
}))

describe('VideoPlayer initial play position', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not seek after metadata has already loaded with no initial position', async () => {
    const props = {
      urls: ['https://example.com/video.mp4'],
      textTracks: [],
      mime: 'video/mp4',
    }

    const { container, rerender } = render(<VideoPlayer {...props} initialPlayPos={0} />)
    const video = container.querySelector('video')
    expect(video).not.toBeNull()

    video!.dispatchEvent(new Event('loadedmetadata'))

    Object.defineProperty(video, 'readyState', {
      configurable: true,
      value: 1,
    })

    rerender(<VideoPlayer {...props} initialPlayPos={12} />)

    await waitFor(() => {
      expect(video!.currentTime).toBe(0)
    })
  })

  it('still applies an initial position before metadata has loaded', async () => {
    const props = {
      urls: ['https://example.com/video.mp4'],
      textTracks: [],
      mime: 'video/mp4',
    }

    const { container } = render(<VideoPlayer {...props} initialPlayPos={12} />)
    const video = container.querySelector('video')
    expect(video).not.toBeNull()

    video!.dispatchEvent(new Event('loadedmetadata'))

    await waitFor(() => {
      expect(video!.currentTime).toBe(12)
    })
  })
})

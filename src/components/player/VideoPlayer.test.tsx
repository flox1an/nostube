import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPlayer } from './VideoPlayer'

const nativeWindow = vi.hoisted(() => ({
  isFullscreen: vi.fn(),
  setFullscreen: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => nativeWindow,
}))

vi.mock('@/hooks', () => ({
  useAppContext: () => ({ config: {} }),
  useIsMobile: () => false,
}))

vi.mock('@/hooks/useMediaUrls', () => ({
  useMediaUrls: ({ urls }: { urls: string[] }) => ({
    ladder: {
      currentUrl: urls[0] ?? null,
      hasMore: false,
      tryNext: vi.fn(),
    },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/workers/blurhashDataURL', () => ({
  blurHashToDataURL: () => null,
}))

vi.mock('../PlayPauseOverlay', () => ({
  PlayPauseOverlay: () => null,
}))

vi.mock('./ControlBar', () => ({
  ControlBar: ({ onToggleFullscreen }: { onToggleFullscreen: () => void }) => (
    <button onClick={onToggleFullscreen}>Fullscreen</button>
  ),
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

describe('VideoPlayer source failures', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not require CORS for native video playback', () => {
    const { container } = render(
      <VideoPlayer urls={['https://example.com/video.mp4']} textTracks={[]} mime="video/mp4" />
    )

    expect(container.querySelector('video')).not.toHaveAttribute('crossorigin')
  })

  it('reports a final source failure only when no fallback remains', () => {
    const onAllSourcesFailed = vi.fn()
    const urls = ['https://example.com/video.mp4']
    const { container } = render(
      <VideoPlayer
        urls={urls}
        textTracks={[]}
        mime="video/mp4"
        onAllSourcesFailed={onAllSourcesFailed}
      />
    )

    fireEvent.error(container.querySelector('video')!)

    expect(onAllSourcesFailed).toHaveBeenCalledWith(urls)
  })
})
describe('VideoPlayer preset thumbnails', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  it('uses the direct preset URL for a hash-addressed poster', () => {
    const hash = 'a'.repeat(64)
    const { container } = render(
      <VideoPlayer
        urls={['https://example.com/video.mp4']}
        textTracks={[]}
        mime="video/mp4"
        poster={`https://blossom.example/${hash}.mp4`}
      />
    )

    expect(container.querySelector('video')).toHaveAttribute(
      'poster',
      `https://imgproxy.nostu.be/v1/preset/feed-preview-v1/${hash}.mp4`
    )
  })
})

describe('VideoPlayer Tauri fullscreen', () => {
  beforeEach(() => {
    nativeWindow.isFullscreen.mockResolvedValue(false)
    nativeWindow.setFullscreen.mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    nativeWindow.isFullscreen.mockReset()
    nativeWindow.setFullscreen.mockReset()
  })

  it('uses native window fullscreen for the F shortcut', async () => {
    render(
      <VideoPlayer urls={['https://example.com/video.mp4']} textTracks={[]} mime="video/mp4" />
    )

    fireEvent.keyDown(window, { key: 'f' })

    await waitFor(() => {
      expect(nativeWindow.setFullscreen).toHaveBeenCalledWith(true)
    })
  })

  it('uses native window fullscreen for the fullscreen control', async () => {
    render(
      <VideoPlayer urls={['https://example.com/video.mp4']} textTracks={[]} mime="video/mp4" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))

    await waitFor(() => {
      expect(nativeWindow.setFullscreen).toHaveBeenCalledWith(true)
    })
  })
})

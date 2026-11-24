import { StrictMode, useRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { CastMediaSource } from '@nostube/core/cast-source'
import { TooltipProvider } from '../../components/tooltip'
import { CastButtons } from './CastControls'
import { CAST_SDK_URL, resetGoogleCastForTests } from './google-cast'
import { useCasting } from './useCasting'

const HASH = 'c'.repeat(64)
const SOURCE: CastMediaSource = {
  url: `https://a.example/${HASH}.mp4`,
  fallbackUrls: [`https://b.example/${HASH}.mp4`],
  contentType: 'video/mp4',
  title: 'A video',
}

function Harness({ source = SOURCE }: { source?: CastMediaSource }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { airPlay, googleCast, remote, error } = useCasting({
    videoRef,
    source,
    googleCastEnabled: true,
  })
  return (
    <TooltipProvider>
      <video ref={videoRef} data-testid="video" />
      <CastButtons airPlay={airPlay} googleCast={googleCast} />
      <output data-testid="remote">{remote ? `${remote.currentTime}` : 'local'}</output>
      <output data-testid="error">{error ?? ''}</output>
    </TooltipProvider>
  )
}

interface LoadRequest {
  media: { contentId: string }
  currentTime: number
}

/** The slice of the Cast Web Sender SDK the player uses. */
function installFakeCastSdk() {
  const contextListeners: Array<() => void> = []
  const playerListeners: Array<() => void> = []
  const remote = {
    isMediaLoaded: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    volumeLevel: 1,
    isMuted: false,
    playerState: null as string | null,
    mediaInfo: null as { contentId: string } | null,
  }
  const sdk = {
    castState: 'NOT_CONNECTED',
    session: null as null | {
      loadMedia: Mock<(request: LoadRequest) => Promise<void>>
      getCastDevice: () => { friendlyName: string }
      getMediaSession: () => null
    },
    failingUrls: new Set<string>(),
    loaded: [] as Array<{ contentId: string; currentTime: number }>,
    controller: {
      playOrPause: vi.fn(),
      seek: vi.fn(),
      setVolumeLevel: vi.fn(),
      muteOrUnmute: vi.fn(),
    },
    requestSession: vi.fn(async () => {
      sdk.castState = 'CONNECTED'
      sdk.session = {
        loadMedia: vi.fn(async (request: LoadRequest) => {
          if (sdk.failingUrls.has(request.media.contentId)) throw 'LOAD_FAILED'
          sdk.loaded.push({ contentId: request.media.contentId, currentTime: request.currentTime })
          Object.assign(remote, {
            isMediaLoaded: true,
            playerState: 'PLAYING',
            currentTime: request.currentTime,
            duration: 120,
            mediaInfo: { contentId: request.media.contentId },
          })
        }),
        getCastDevice: () => ({ friendlyName: 'Living Room TV' }),
        getMediaSession: () => null,
      }
      contextListeners.forEach(listener => listener())
    }),
    endCurrentSession: vi.fn(() => {
      sdk.castState = 'NOT_CONNECTED'
      sdk.session = null
      Object.assign(remote, { isMediaLoaded: false, playerState: 'IDLE', mediaInfo: null })
      contextListeners.forEach(listener => listener())
    }),
    remote,
    emit: () => playerListeners.forEach(listener => listener()),
  }
  const context = {
    setOptions: vi.fn(),
    getCastState: () => sdk.castState,
    getCurrentSession: () => sdk.session,
    requestSession: sdk.requestSession,
    endCurrentSession: sdk.endCurrentSession,
    addEventListener: (_type: string, listener: () => void) => contextListeners.push(listener),
  }
  Object.assign(window, {
    chrome: {
      cast: {
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845',
          MediaInfo: class {
            constructor(
              public contentId: string,
              public contentType: string
            ) {}
          },
          GenericMediaMetadata: class {},
          LoadRequest: class {
            currentTime = 0
            constructor(public media: unknown) {}
          },
          StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' },
        },
        Image: class {},
        AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
      },
    },
    cast: {
      framework: {
        CastContext: { getInstance: () => context },
        CastContextEventType: {
          CAST_STATE_CHANGED: 'caststatechanged',
          SESSION_STATE_CHANGED: 'sessionstatechanged',
        },
        RemotePlayer: function RemotePlayer() {
          return remote
        },
        RemotePlayerController: function RemotePlayerController() {
          return {
            ...sdk.controller,
            addEventListener: (_type: string, listener: () => void) =>
              playerListeners.push(listener),
          }
        },
        RemotePlayerEventType: { ANY_CHANGE: 'anyChanged' },
      },
    },
  })
  return sdk
}

function castScripts() {
  return document.querySelectorAll(`script[src="${CAST_SDK_URL}"]`)
}

beforeEach(() => {
  resetGoogleCastForTests()
  castScripts().forEach(script => script.remove())
})

afterEach(() => {
  cleanup()
  for (const key of ['chrome', 'cast', '__onGCastApiAvailable']) {
    delete (window as unknown as Record<string, unknown>)[key]
  }
})

describe('Google Cast', () => {
  it('loads nothing from Google outside Chromium and shows no cast button', () => {
    render(<Harness />)
    expect(castScripts()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /cast/i })).toBeNull()
  })

  it('stays hidden when the SDK fails to load', () => {
    Object.assign(window, { chrome: {} })
    render(<Harness />)
    fireEvent.error(castScripts()[0])
    expect(screen.queryByRole('button', { name: /cast/i })).toBeNull()
  })

  it('loads the SDK once for any number of players, also under StrictMode', () => {
    installFakeCastSdk()
    render(
      <StrictMode>
        <Harness />
        <Harness />
      </StrictMode>
    )
    expect(castScripts()).toHaveLength(1)
  })

  it('casts the original URL from the local position, pauses here, and resumes here on stop', async () => {
    const sdk = installFakeCastSdk()
    render(<Harness />)
    act(() => window.__onGCastApiAvailable?.(true))

    const video = screen.getByTestId('video') as HTMLVideoElement
    Object.defineProperty(video, 'readyState', { value: 4 })
    video.currentTime = 42
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {})
    const play = vi.spyOn(video, 'play').mockResolvedValue()

    sdk.failingUrls.add(SOURCE.url)
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }))
    expect(sdk.requestSession).toHaveBeenCalledOnce()

    // The first server fails on the receiver; the mirror of the same blob plays.
    await waitFor(() => expect(screen.getByTestId('remote')).toHaveTextContent('42'))
    expect(sdk.loaded).toEqual([{ contentId: SOURCE.fallbackUrls[0], currentTime: 42 }])
    expect(pause).toHaveBeenCalled()

    act(() => {
      sdk.remote.currentTime = 80
      sdk.emit()
    })
    sdk.controller.seek.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Stop casting' }))

    expect(screen.getByTestId('remote')).toHaveTextContent('local')
    expect(video.currentTime).toBe(80)
    expect(play).toHaveBeenCalled()
  })

  it('treats a closed device picker as no error', async () => {
    const sdk = installFakeCastSdk()
    sdk.requestSession.mockRejectedValueOnce('cancel')
    render(<Harness />)
    act(() => window.__onGCastApiAvailable?.(true))
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }))
    await waitFor(() => expect(sdk.requestSession).toHaveBeenCalled())
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })

  it('reports a receiver that cannot load any server and keeps local playback', async () => {
    const sdk = installFakeCastSdk()
    sdk.failingUrls = new Set([SOURCE.url, ...SOURCE.fallbackUrls])
    render(<Harness />)
    act(() => window.__onGCastApiAvailable?.(true))
    fireEvent.click(screen.getByRole('button', { name: 'Cast' }))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('load'))
    expect(screen.getByTestId('remote')).toHaveTextContent('local')
  })

  it('joins a session already playing this video without loading it again', async () => {
    const sdk = installFakeCastSdk()
    await sdk.requestSession()
    await sdk.session!.loadMedia({
      media: { contentId: `https://z.example/${HASH}.mp4` },
      currentTime: 7,
    })
    render(<Harness />)
    act(() => window.__onGCastApiAvailable?.(true))
    expect(screen.getByTestId('remote')).toHaveTextContent('7')
    expect(sdk.loaded).toHaveLength(1)
  })
})

describe('AirPlay', () => {
  it('shows the button once Safari reports a receiver and opens the picker on click', () => {
    const picker = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'webkitShowPlaybackTargetPicker', {
      configurable: true,
      value: picker,
    })
    try {
      render(<Harness />)
      expect(screen.queryByRole('button', { name: 'AirPlay' })).toBeNull()
      const video = screen.getByTestId('video')
      act(() => {
        video.dispatchEvent(
          Object.assign(new Event('webkitplaybacktargetavailabilitychanged'), {
            availability: 'available',
          })
        )
      })
      fireEvent.click(screen.getByRole('button', { name: 'AirPlay' }))
      expect(picker).toHaveBeenCalledOnce()
    } finally {
      delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>)
        .webkitShowPlaybackTargetPicker
    }
  })
})

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void
  }
}

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { isSameCastMedia, type CastMediaSource } from '@nostube/core/cast-source'
import {
  getGoogleCastState,
  googleCastControls,
  initGoogleCast,
  loadGoogleCastMedia,
  requestGoogleCastSession,
  subscribeGoogleCast,
  type GoogleCastState,
} from './google-cast'

/** WebKit's AirPlay additions to media elements. */
interface AirPlayMediaElement extends HTMLMediaElement {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
}

export type CastError = 'connect' | 'load' | 'playback'

/** What the control bar drives: the local element, or the receiver while casting. */
export interface PlaybackControls {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

export interface AirPlayState {
  /** Safari offers AirPlay and a receiver is on the network, or AirPlay is on. */
  available: boolean
  active: boolean
  /** Opens Safari's device picker; also where AirPlay is turned off. */
  showPicker: () => void
}

export interface GoogleCastControlState {
  available: boolean
  state: GoogleCastState
  /** The receiver plays this player's video. */
  castingThis: boolean
  busy: boolean
  /** Opens the device picker if needed, then loads this video on the receiver. */
  start: () => void
  stop: () => void
}

interface UseCastingOptions {
  videoRef: React.RefObject<HTMLMediaElement | null>
  /** Undefined when no receiver could play the video on its own. */
  source: CastMediaSource | undefined
  googleCastEnabled: boolean
}

const PLAYING_STATES = new Set(['playing', 'buffering'])

function useAirPlay(
  videoRef: React.RefObject<HTMLMediaElement | null>,
  enabled: boolean
): AirPlayState {
  const [available, setAvailable] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const el = videoRef.current as AirPlayMediaElement | null
    if (!enabled || !el || typeof el.webkitShowPlaybackTargetPicker !== 'function') return
    const handleAvailability = (event: Event) =>
      setAvailable((event as Event & { availability?: string }).availability === 'available')
    const handleWireless = () => setActive(!!el.webkitCurrentPlaybackTargetIsWireless)
    handleWireless()
    el.addEventListener('webkitplaybacktargetavailabilitychanged', handleAvailability)
    el.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', handleWireless)
    return () => {
      el.removeEventListener('webkitplaybacktargetavailabilitychanged', handleAvailability)
      el.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', handleWireless)
      setAvailable(false)
      setActive(false)
    }
  }, [videoRef, enabled])

  const showPicker = useCallback(() => {
    // Synchronous on purpose: the picker needs the click's user activation.
    ;(videoRef.current as AirPlayMediaElement | null)?.webkitShowPlaybackTargetPicker?.()
  }, [videoRef])

  return { available: enabled && (available || active), active: enabled && active, showPicker }
}

/**
 * AirPlay and Google Cast for one player. AirPlay leaves the media element in
 * charge: Safari moves its playback to the receiver. During a Google Cast session
 * the receiver is authoritative; `remote` then replaces the local controls.
 */
export function useCasting({ videoRef, source, googleCastEnabled }: UseCastingOptions) {
  const airPlay = useAirPlay(videoRef, !!source)
  const castState = useSyncExternalStore(subscribeGoogleCast, getGoogleCastState)
  const [error, setError] = useState<CastError | null>(null)

  useEffect(() => {
    if (googleCastEnabled && source) initGoogleCast()
  }, [googleCastEnabled, source])

  const sourceUrls = useMemo(() => (source ? [source.url, ...source.fallbackUrls] : []), [source])
  const castingThis =
    castState.connection === 'connected' && isSameCastMedia(castState.mediaUrl, sourceUrls)

  const start = useCallback(async () => {
    if (!source) return
    setError(null)
    // No await before the picker: it needs the click's user activation.
    if (getGoogleCastState().connection !== 'connected') {
      const result = await requestGoogleCastSession()
      if (result === 'failed') setError('connect')
      if (result !== 'connected') return
    }
    // A session that joined on its own may already play this video.
    if (isSameCastMedia(getGoogleCastState().mediaUrl, sourceUrls)) return
    const el = videoRef.current
    const loaded = await loadGoogleCastMedia(source, {
      startTime: el?.currentTime ?? 0,
      // Carry the local state over; a video not started yet starts on the receiver.
      autoplay: !el || !el.paused || el.currentTime === 0,
    })
    if (!loaded) setError('load')
  }, [source, sourceUrls, videoRef])

  // Last receiver position, for handing playback back to the local element.
  const lastRemoteRef = useRef({ time: 0, playing: false })
  useEffect(() => {
    if (!castingThis) return
    if (castState.playback === 'paused' || PLAYING_STATES.has(castState.playback)) {
      lastRemoteRef.current = {
        time: castState.currentTime,
        playing: castState.playback !== 'paused',
      }
    }
  }, [castingThis, castState.currentTime, castState.playback])

  const castStateRef = useRef(castState)
  useEffect(() => {
    castStateRef.current = castState
  }, [castState])

  // The video the receiver played; another video in the same player starts fresh.
  const castUrlRef = useRef<string | null>(null)
  const sourceUrlRef = useRef(source?.url)
  useEffect(() => {
    sourceUrlRef.current = source?.url
  }, [source?.url])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (castingThis) {
      castUrlRef.current = sourceUrlRef.current ?? null
      // One audio source: autoplay or a stray play() must not start the local copy.
      const keepPaused = () => el.pause()
      keepPaused()
      el.addEventListener('play', keepPaused)
      return () => el.removeEventListener('play', keepPaused)
    }
    const castUrl = castUrlRef.current
    castUrlRef.current = null
    const { time, playing } = lastRemoteRef.current
    lastRemoteRef.current = { time: 0, playing: false }
    if (!castUrl || castUrl !== sourceUrlRef.current) return
    // Stopped, receiver lost, media replaced or finished: continue here.
    const { playback } = castStateRef.current
    if (playback === 'error') setError('playback')
    const resume = () => {
      if (time > 0) el.currentTime = time
      if (playing && playback !== 'ended') {
        // Autoplay rules may refuse this without a fresh click; the viewer presses play.
        el.play().catch(() => {})
      }
    }
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) resume()
    else el.addEventListener('loadedmetadata', resume, { once: true })
    return undefined
  }, [castingThis, videoRef])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(timer)
  }, [error])

  const remote = useMemo<PlaybackControls | null>(
    () =>
      castingThis
        ? {
            isPlaying: PLAYING_STATES.has(castState.playback),
            currentTime: castState.currentTime,
            duration: castState.duration,
            volume: castState.volume,
            isMuted: castState.muted,
            play: async () => googleCastControls.play(),
            pause: googleCastControls.pause,
            seek: googleCastControls.seek,
            setVolume: googleCastControls.setVolume,
            toggleMute: googleCastControls.toggleMute,
          }
        : null,
    [castingThis, castState]
  )

  const googleCast: GoogleCastControlState = {
    available:
      googleCastEnabled &&
      !!source &&
      castState.connection !== 'unavailable' &&
      castState.connection !== 'no-devices',
    state: castState,
    castingThis,
    busy: castState.connection === 'connecting' || castState.loading,
    start: () => void start(),
    stop: googleCastControls.stop,
  }

  return { airPlay, googleCast, remote, error, castingThis }
}

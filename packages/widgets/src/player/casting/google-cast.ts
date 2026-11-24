import {
  HLS_CAST_CONTENT_TYPE,
  detectHlsSegmentFormat,
  type CastMediaSource,
} from '@nostube/core/cast-source'

/**
 * Google Cast through Google's Web Sender SDK and its Default Media Receiver. One
 * CastContext per page, kept outside React: sessions outlive player mounts and
 * navigation, and the SDK restores an origin's session after a reload.
 */

export const CAST_SDK_URL =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

export type GoogleCastConnection =
  /** SDK not loaded, blocked, or not supported by this browser. */
  'unavailable' | 'no-devices' | 'disconnected' | 'connecting' | 'connected'

export type RemotePlaybackState = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error'

export interface GoogleCastState {
  connection: GoogleCastConnection
  deviceName?: string
  /** URL of the media loaded on the receiver, if any. */
  mediaUrl?: string
  playback: RemotePlaybackState
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  /** A load request from this page is in flight. */
  loading: boolean
  /** The receiver could not load any of the source's URLs. */
  loadFailed: boolean
}

// Only the SDK surface this module uses.
interface CastSession {
  getCastDevice(): { friendlyName?: string }
  getMediaSession(): { idleReason?: string | null } | null
  loadMedia(request: unknown): Promise<unknown>
}
interface CastContext {
  setOptions(options: Record<string, unknown>): void
  getCastState(): string
  getCurrentSession(): CastSession | null
  requestSession(): Promise<unknown>
  endCurrentSession(stopCasting: boolean): void
  addEventListener(type: string, handler: () => void): void
}
interface RemotePlayer {
  isMediaLoaded: boolean
  isPaused: boolean
  currentTime: number
  duration: number
  volumeLevel: number
  isMuted: boolean
  playerState: string | null
  mediaInfo: { contentId?: string; contentUrl?: string } | null
}
interface RemotePlayerController {
  addEventListener(type: string, handler: () => void): void
  playOrPause(): void
  seek(): void
  setVolumeLevel(): void
  muteOrUnmute(): void
}
interface ChromeCastMedia {
  DEFAULT_MEDIA_RECEIVER_APP_ID: string
  MediaInfo: new (contentId: string, contentType: string) => Record<string, unknown>
  GenericMediaMetadata: new () => Record<string, unknown>
  LoadRequest: new (media: unknown) => Record<string, unknown>
  StreamType: { BUFFERED: string; LIVE: string }
}
interface CastGlobals {
  __onGCastApiAvailable?: (available: boolean) => void
  cast?: {
    framework: {
      CastContext: { getInstance(): CastContext }
      CastContextEventType: { CAST_STATE_CHANGED: string; SESSION_STATE_CHANGED: string }
      RemotePlayer: new () => RemotePlayer
      RemotePlayerController: new (player: RemotePlayer) => RemotePlayerController
      RemotePlayerEventType: { ANY_CHANGE: string }
    }
  }
  chrome?: {
    cast?: {
      media: ChromeCastMedia
      Image: new (url: string) => unknown
      AutoJoinPolicy: { ORIGIN_SCOPED: string }
    }
  }
}

const INITIAL_STATE: GoogleCastState = {
  connection: 'unavailable',
  playback: 'idle',
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  loading: false,
  loadFailed: false,
}

let state = INITIAL_STATE
const listeners = new Set<() => void>()
let started = false
let context: CastContext | null = null
let player: RemotePlayer | null = null
let controller: RemotePlayerController | null = null

function setState(patch: Partial<GoogleCastState>) {
  state = { ...state, ...patch }
  listeners.forEach(listener => listener())
}

export function subscribeGoogleCast(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getGoogleCastState(): GoogleCastState {
  return state
}

const CONNECTION_BY_CAST_STATE: Record<string, GoogleCastConnection> = {
  NO_DEVICES_AVAILABLE: 'no-devices',
  NOT_CONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
}

function remotePlayback(remote: RemotePlayer, idleReason?: string | null): RemotePlaybackState {
  switch (remote.playerState) {
    case 'PLAYING':
      return 'playing'
    case 'PAUSED':
      return 'paused'
    case 'BUFFERING':
    case 'LOADING':
      return 'buffering'
    default:
      if (idleReason === 'FINISHED') return 'ended'
      if (idleReason === 'ERROR') return 'error'
      return 'idle'
  }
}

function sync() {
  if (!context || !player) return
  const connection = CONNECTION_BY_CAST_STATE[context.getCastState()] ?? 'disconnected'
  const session = context.getCurrentSession()
  setState({
    connection,
    deviceName: session?.getCastDevice().friendlyName || undefined,
    mediaUrl: player.isMediaLoaded
      ? player.mediaInfo?.contentUrl || player.mediaInfo?.contentId || undefined
      : undefined,
    playback: remotePlayback(player, session?.getMediaSession()?.idleReason),
    currentTime: player.currentTime || 0,
    duration: player.duration || 0,
    volume: player.volumeLevel ?? 1,
    muted: player.isMuted,
    ...(connection === 'connected' ? {} : { loading: false, loadFailed: false }),
  })
}

function setUp(globals: CastGlobals) {
  const framework = globals.cast?.framework
  const chromeCast = globals.chrome?.cast
  if (!framework || !chromeCast) return
  context = framework.CastContext.getInstance()
  context.setOptions({
    receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
  })
  player = new framework.RemotePlayer()
  controller = new framework.RemotePlayerController(player)
  controller.addEventListener(framework.RemotePlayerEventType.ANY_CHANGE, sync)
  context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, sync)
  context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, sync)
  sync()
}

/**
 * Loads the SDK once per page. Only Chromium browsers expose `window.chrome`, the
 * SDK's own prerequisite; elsewhere nothing is requested from Google. A blocked or
 * failed script leaves casting unavailable and playback untouched.
 */
export function initGoogleCast(): void {
  if (started || typeof window === 'undefined' || !('chrome' in window)) return
  started = true
  const globals = window as unknown as CastGlobals
  // The SDK calls this once it has loaded the Cast framework; it must exist first.
  globals.__onGCastApiAvailable = available => {
    if (available) setUp(globals)
  }
  const script = document.createElement('script')
  script.src = CAST_SDK_URL
  script.async = true
  script.onerror = () => {
    if (import.meta.env.DEV) console.info('[Cast] Google Cast SDK failed to load')
  }
  document.head.appendChild(script)
}

/**
 * Opens Chrome's device picker. Call it straight from a click: the picker needs the
 * click's user activation. Closing the picker is 'cancelled', not an error.
 */
export async function requestGoogleCastSession(): Promise<'connected' | 'cancelled' | 'failed'> {
  if (!context || state.connection === 'connecting') return 'cancelled'
  try {
    await context.requestSession()
  } catch (error) {
    // The SDK rejects with a chrome.cast.ErrorCode string; 'cancel' is the closed picker.
    if (error === 'cancel') return 'cancelled'
    if (import.meta.env.DEV) console.info('[Cast] session request failed:', error)
    return 'failed'
  }
  sync()
  return context.getCurrentSession() ? 'connected' : 'failed'
}

interface CastLoadOptions {
  startTime: number
  autoplay: boolean
}

/**
 * Loads the source into the current session, trying its fallback URLs in order.
 * The receiver fetches the media itself; nothing is proxied through this page.
 */
export async function loadGoogleCastMedia(
  source: CastMediaSource,
  { startTime, autoplay }: CastLoadOptions
): Promise<boolean> {
  const session = context?.getCurrentSession()
  const chromeCast = (window as unknown as CastGlobals).chrome?.cast
  if (!session || !chromeCast || state.loading) return false
  setState({ loading: true, loadFailed: false })

  // The Default Media Receiver assumes MPEG-TS segments unless told otherwise.
  const isFmp4 =
    source.contentType === HLS_CAST_CONTENT_TYPE &&
    (await detectHlsSegmentFormat(source.url)) === 'fmp4'

  for (const url of [source.url, ...source.fallbackUrls]) {
    const media = new chromeCast.media.MediaInfo(url, source.contentType)
    media.contentUrl = url
    media.streamType = source.live
      ? chromeCast.media.StreamType.LIVE
      : chromeCast.media.StreamType.BUFFERED
    if (isFmp4) {
      media.hlsSegmentFormat = 'fmp4'
      media.hlsVideoSegmentFormat = 'fmp4'
    }
    const metadata = new chromeCast.media.GenericMediaMetadata()
    if (source.title) metadata.title = source.title
    if (source.thumbnailUrl) metadata.images = [new chromeCast.Image(source.thumbnailUrl)]
    media.metadata = metadata

    const request = new chromeCast.media.LoadRequest(media)
    request.currentTime = source.live ? undefined : startTime
    request.autoplay = autoplay
    try {
      await session.loadMedia(request)
      setState({ loading: false })
      sync()
      return true
    } catch (error) {
      if (import.meta.env.DEV) console.info('[Cast] receiver could not load a source:', error)
      if (context?.getCurrentSession() !== session) break
    }
  }
  setState({ loading: false, loadFailed: true })
  return false
}

export const googleCastControls = {
  play() {
    if (player?.isPaused) controller?.playOrPause()
  },
  pause() {
    if (player && !player.isPaused) controller?.playOrPause()
  },
  seek(time: number) {
    if (!player || !controller) return
    player.currentTime = Math.max(0, time)
    controller.seek()
  },
  setVolume(volume: number) {
    if (!player || !controller) return
    player.volumeLevel = Math.max(0, Math.min(1, volume))
    controller.setVolumeLevel()
    if (volume > 0 && player.isMuted) controller.muteOrUnmute()
  },
  toggleMute() {
    controller?.muteOrUnmute()
  },
  /** Ends the session and stops the receiver app. */
  stop() {
    context?.endCurrentSession(true)
  },
}

/** Test hook: forget the loaded SDK. */
export function resetGoogleCastForTests() {
  state = INITIAL_STATE
  started = false
  context = null
  player = null
  controller = null
  listeners.clear()
}

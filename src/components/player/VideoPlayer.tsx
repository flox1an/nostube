import * as React from 'react'
import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { type TextTrack, type VideoVariant } from '@/utils/video-event'
import audioFallback from '@/assets/audio-fallback.webp'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { useIsMobile } from '@/hooks'
import {
  usePlayerState,
  useControlsVisibility,
  useSeekAccumulator,
  useAdaptiveQuality,
  useValidatedTextTracks,
  useVideoVariantSelector,
  useMediaSession,
} from './hooks'
import { usePlaybackEngine } from './engines'
import { ControlBar } from './ControlBar'
import { LoadingSpinner } from './LoadingSpinner'
import { TouchOverlay } from './TouchOverlay'
import { SeekIndicator } from './SeekIndicator'
import { PlayPauseOverlay } from '../PlayPauseOverlay'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
import type { VideoChapter } from '@/lib/video-chapters'
// import { BulletComments } from './BulletComments' // disabled for now

interface VideoPlayerProps {
  urls: string[]
  loop?: boolean
  textTracks: TextTrack[]
  mime: string
  mediaType?: 'video' | 'audio'
  poster?: string
  posterHash?: string
  onTimeUpdate?: (time: number) => void
  className?: string
  style?: React.CSSProperties
  contentWarning?: string
  sha256?: string
  authorPubkey?: string
  eventId?: string
  initialPlayPos?: number
  onAllSourcesFailed?: (urls: string[]) => void
  cinemaMode?: boolean
  onToggleCinemaMode?: () => void
  onVideoDimensionsLoaded?: (width: number, height: number) => void
  onEnded?: () => void
  onVideoElementReady?: (element: HTMLMediaElement | null) => void
  videoVariants?: VideoVariant[]
  title?: string
  authorName?: string
  onPreviousTrack?: () => void
  onNextTrack?: () => void
  chapters?: VideoChapter[]
  showTimelineMarkers?: boolean
}

const LOOP_STORAGE_KEY = 'nostube:video-loop'
const STARTUP_FAILOVER_TIMEOUT_MS = 3500

export const VideoPlayer = React.memo(function VideoPlayer({
  urls,
  mime,
  mediaType,
  poster,
  posterHash,
  textTracks,
  loop: loopProp = false,
  onTimeUpdate,
  className,
  style,
  contentWarning,
  sha256,
  authorPubkey,
  eventId,
  initialPlayPos = 0,
  onAllSourcesFailed,
  cinemaMode = false,
  onToggleCinemaMode,
  onVideoDimensionsLoaded,
  onEnded,
  onVideoElementReady,
  videoVariants,
  title,
  authorName,
  onPreviousTrack,
  onNextTrack,
  chapters,
  showTimelineMarkers = true,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLMediaElement | null>(null)
  const setMediaElementRef = useCallback((element: HTMLMediaElement | null) => {
    videoRef.current = element
  }, [])
  const [showBufferingSpinner, setShowBufferingSpinner] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [selectedSubtitleLang, setSelectedSubtitleLang] = useState('')
  const [isSeeking, setIsSeeking] = useState(false)

  // Loop state - use prop if provided, otherwise use localStorage
  const [loopEnabled, setLoopEnabled] = useState(() => {
    if (loopProp) return true
    try {
      return localStorage.getItem(LOOP_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleLoop = useCallback(() => {
    setLoopEnabled(prev => {
      const newValue = !prev
      try {
        localStorage.setItem(LOOP_STORAGE_KEY, String(newValue))
      } catch {
        // ignore storage errors
      }
      return newValue
    })
  }, [])
  const userInitiatedRef = useRef(false)
  const isMobile = useIsMobile()
  const baseMime = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  const isAudioOnly = mediaType === 'audio' || baseMime.startsWith('audio/')
  const effectiveCinemaMode = isAudioOnly ? false : cinemaMode

  // Video quality variant selector with position preservation
  const { selectedVariantIndex, effectiveUrls, effectiveSha256, handleVariantChange } =
    useVideoVariantSelector({
      videoRef,
      videoVariants,
      urls,
      sha256,
    })

  // Cleanup: pause video and clear source on unmount to stop downloads
  useEffect(() => {
    const el = videoRef.current
    return () => {
      if (el) {
        el.pause()
        // Clear the source to abort any ongoing downloads
        el.removeAttribute('src')
        el.load() // This aborts any pending network requests
      }
    }
  }, [])

  // Pause old video when URLs change (playlist mode: component doesn't remount)
  const prevUrlsRef = useRef<string[]>([])
  useEffect(() => {
    const prevUrls = prevUrlsRef.current
    prevUrlsRef.current = urls

    // Skip on first render or if urls are the same
    if (prevUrls.length === 0 || prevUrls === urls) return
    // Check if URLs actually changed (not just same reference)
    if (prevUrls.length === urls.length && prevUrls.every((url, i) => url === urls[i])) return

    const el = videoRef.current
    if (el) {
      el.pause()
    }
  }, [urls])

  // Store callbacks in refs to avoid dependency issues
  const onAllSourcesFailedRef = useRef(onAllSourcesFailed)
  const urlsRef = useRef(urls)
  useEffect(() => {
    onAllSourcesFailedRef.current = onAllSourcesFailed
    urlsRef.current = urls
  }, [onAllSourcesFailed, urls])

  const hasHlsSource = useMemo(
    () =>
      baseMime === 'application/vnd.apple.mpegurl' ||
      effectiveUrls.some(url => url.endsWith('.m3u8')),
    [baseMime, effectiveUrls]
  )

  const hasDashSource = useMemo(
    () => baseMime === 'application/dash+xml' || effectiveUrls.some(url => url.endsWith('.mpd')),
    [baseMime, effectiveUrls]
  )

  // HLS and DASH manifests contain their own variants and segment URLs. Feeding the
  // manifest through video proxy candidates can add failed requests before ABR has useful data.
  const hasManifestSource = hasHlsSource || hasDashSource
  const proxyConfig = useMemo(() => ({ enabled: !hasManifestSource }), [hasManifestSource])

  const { ladder: videoUrlLadder, isLoading: isLoadingVideoUrls } = useMediaUrls({
    urls: effectiveUrls,
    variants: videoVariants,
    mediaType: isAudioOnly ? 'audio' : 'video',
    sha256: effectiveSha256,
    kind: 34235,
    authorPubkey,
    proxyConfig,
  })
  const videoUrl = videoUrlLadder.currentUrl
  const hasMoreVideoUrls = videoUrlLadder.hasMore
  const moveToNextVideo = videoUrlLadder.tryNext.bind(videoUrlLadder)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const manifestByInput = hasManifestSource
    const manifestByUrl = videoUrl?.endsWith('.m3u8') || videoUrl?.endsWith('.mpd') || false
    if (!manifestByInput && !manifestByUrl) return

    console.info('[Streaming:VideoPlayer]', 'source selection', {
      mime,
      eventId,
      authorPubkey,
      effectiveUrls,
      effectiveSha256,
      selectedVideoUrl: videoUrl,
      hasMoreVideoUrls,
      isLoadingVideoUrls,
      proxyConfig,
      hasHlsSource,
      hasDashSource,
    })
  }, [
    authorPubkey,
    effectiveSha256,
    effectiveUrls,
    eventId,
    hasDashSource,
    hasHlsSource,
    hasManifestSource,
    hasMoreVideoUrls,
    isLoadingVideoUrls,
    mime,
    proxyConfig,
    videoUrl,
  ])

  // Notify parent when all sources fail
  useEffect(() => {
    if (!hasMoreVideoUrls && !isLoadingVideoUrls && videoUrl === null) {
      onAllSourcesFailedRef.current?.(urlsRef.current)
    }
  }, [hasMoreVideoUrls, isLoadingVideoUrls, videoUrl])

  const handleDashError = useCallback(
    (message: string) => {
      console.error('DASH playback failed:', message)
      if (hasMoreVideoUrls) {
        moveToNextVideo()
      } else {
        onAllSourcesFailedRef.current?.(urlsRef.current)
      }
    },
    [hasMoreVideoUrls, moveToNextVideo]
  )

  // Protocol-neutral playback engine: native / HLS / DASH behind one interface.
  const engine = usePlaybackEngine({
    videoRef,
    videoUrl,
    ladder: videoUrlLadder,
    mime,
    effectiveUrls,
    videoVariants,
    selectedVariantIndex,
    handleVariantChange,
    authorPubkey,
    eventId,
    autoPlay: !contentWarning,
    onError: handleDashError,
  })

  const isHls = engine.mode === 'hls'
  const isDash = engine.mode === 'dash'

  useEffect(() => {
    if (!import.meta.env.DEV || (!isHls && !isDash)) return
    console.info('[Streaming:VideoPlayer]', 'streaming mode resolved', {
      mode: engine.mode,
      isHls,
      isDash,
      mime,
      videoUrl,
      byHlsMime: baseMime === 'application/vnd.apple.mpegurl',
      byDashMime: baseMime === 'application/dash+xml',
      byHlsUrl: videoUrl?.endsWith('.m3u8') ?? false,
      byDashUrl: videoUrl?.endsWith('.mpd') ?? false,
    })
  }, [baseMime, engine.mode, isDash, isHls, mime, videoUrl])

  // Validate text tracks (check availability, use blossom fallback)
  const { validatedTracks } = useValidatedTextTracks(textTracks)

  // Player state
  const playerState = usePlayerState({
    videoRef,
    onTimeUpdate,
  })

  // Controls visibility
  const { isVisible: controlsVisible, showControls } = useControlsVisibility({
    isPlaying: playerState.isPlaying,
    isSeeking,
    hideDelay: 2000,
  })

  // Handle seeking state change from progress bar
  const handleSeekingChange = useCallback((seeking: boolean) => {
    setIsSeeking(seeking)
  }, [])

  // Seek accumulator for arrow keys and touch
  const handleAccumulatedSeek = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current
      if (video) {
        const targetTime = video.currentTime + deltaSeconds
        const clampedTime = Math.max(0, Math.min(video.duration || Infinity, targetTime))
        playerState.seek(clampedTime)
      }
    },
    [playerState]
  )

  const { addSeek, accumulatedTime, isAccumulating, direction } = useSeekAccumulator({
    onSeek: handleAccumulatedSeek,
    stepSize: 5,
    debounceMs: 500,
  })

  // Adaptive quality - auto-downgrade on buffering/slow network (only for non-HLS)
  useAdaptiveQuality({
    videoRef,
    videoVariants,
    selectedVariantIndex,
    onVariantChange: handleVariantChange,
    enabled: !isHls && (videoVariants?.length ?? 0) > 1,
  })

  // Set initial play position - must wait for video to be ready before seeking
  const hasSetInitialPos = useRef(false)
  const initialPlayPosRef = useRef(initialPlayPos)

  // Keep ref in sync with prop (update in effect to satisfy React compiler)
  useEffect(() => {
    initialPlayPosRef.current = initialPlayPos
  }, [initialPlayPos])

  useEffect(() => {
    const el = videoRef.current
    if (!el || hasSetInitialPos.current) return

    const setInitialPosition = () => {
      hasSetInitialPos.current = true
      // Use ref to get latest value, avoiding stale closure issues
      const pos = initialPlayPosRef.current
      if (pos > 0 && Math.abs(el.currentTime - pos) > 1) {
        el.currentTime = pos
      }
    }

    // If video is already ready (readyState >= 1 means HAVE_METADATA)
    if (el.readyState >= 1) {
      setInitialPosition()
    } else {
      // Wait for video metadata to load before seeking
      el.addEventListener('loadedmetadata', setInitialPosition, { once: true })
      return () => el.removeEventListener('loadedmetadata', setInitialPosition)
    }
    // Include videoUrl so effect re-runs when video element becomes available after loading
  }, [initialPlayPos, videoUrl])

  useEffect(() => {
    hasSetInitialPos.current = false
  }, [urls])

  // Explicit autoplay - browsers may block the autoPlay attribute, so we call play() explicitly
  useEffect(() => {
    const el = videoRef.current
    if (!el || contentWarning || !videoUrl) return

    let hasPlayed = false

    const attemptAutoplay = async () => {
      if (hasPlayed || el.paused === false) return
      hasPlayed = true

      try {
        await el.play()
      } catch (err) {
        // Autoplay was blocked by the browser - this is expected behavior
        if (import.meta.env.DEV) {
          console.log('[VideoPlayer] Autoplay blocked:', err)
        }
      }
    }

    // If video is ready to play, attempt autoplay immediately
    if (el.readyState >= 3) {
      attemptAutoplay()
    } else {
      // Listen for multiple events to catch all cases
      el.addEventListener('canplay', attemptAutoplay)
      el.addEventListener('loadeddata', attemptAutoplay)

      return () => {
        el.removeEventListener('canplay', attemptAutoplay)
        el.removeEventListener('loadeddata', attemptAutoplay)
      }
    }
  }, [videoUrl, contentWarning])

  // Notify parent when video element is ready
  useEffect(() => {
    onVideoElementReady?.(videoRef.current)
  }, [onVideoElementReady, isAudioOnly])

  // Detect video dimensions
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const handleLoadedMetadata = () => {
      if (
        onVideoDimensionsLoaded &&
        el instanceof HTMLVideoElement &&
        el.videoWidth > 0 &&
        el.videoHeight > 0
      ) {
        onVideoDimensionsLoaded(el.videoWidth, el.videoHeight)
      }
    }

    el.addEventListener('loadedmetadata', handleLoadedMetadata)
    if (
      el instanceof HTMLVideoElement &&
      el.readyState >= 1 &&
      el.videoWidth > 0 &&
      el.videoHeight > 0
    ) {
      handleLoadedMetadata()
    }

    return () => el.removeEventListener('loadedmetadata', handleLoadedMetadata)
  }, [onVideoDimensionsLoaded])

  // Show spinner 500ms after videoUrl changes if the media hasn't started playing yet.
  // Always schedule on URL change — canplay/playing cancel it if the server is fast.
  useEffect(() => {
    if (!videoUrl) {
      setShowBufferingSpinner(false)
      return
    }

    let timer: number | null = window.setTimeout(() => {
      setShowBufferingSpinner(true)
    }, 500)

    const hide = () => {
      setShowBufferingSpinner(false)
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    const el = videoRef.current
    if (el) {
      el.addEventListener('canplay', hide)
      el.addEventListener('playing', hide)
    }

    return () => {
      if (timer !== null) clearTimeout(timer)
      if (el) {
        el.removeEventListener('canplay', hide)
        el.removeEventListener('playing', hide)
      }
    }
  }, [videoUrl])

  // Handle video ended
  useEffect(() => {
    if (!onEnded) return
    const el = videoRef.current
    if (!el) return

    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [onEnded])

  // Handle video error
  const handleVideoError = useCallback(() => {
    if (hasMoreVideoUrls) {
      if (import.meta.env.DEV) {
        console.log('Video error, trying next URL...')
      }
      moveToNextVideo()
    } else {
      console.error('All video URLs failed')
      onAllSourcesFailed?.(urls)
    }
  }, [hasMoreVideoUrls, moveToNextVideo, onAllSourcesFailed, urls])

  // Startup failover - move to next URL if the source cannot become playable quickly.
  // Store moveToNextVideo in a ref so the effect only re-runs when videoUrl changes,
  // not when URL discovery updates the callback reference or hasMore flag.
  const moveToNextVideoRef = useRef(moveToNextVideo)
  const hasMoreVideoUrlsRef = useRef(hasMoreVideoUrls)
  const pendingUrlFailoverSeekTimeRef = useRef<number | null>(null)
  useEffect(() => {
    moveToNextVideoRef.current = moveToNextVideo
    hasMoreVideoUrlsRef.current = hasMoreVideoUrls
  }, [moveToNextVideo, hasMoreVideoUrls])

  const preserveCurrentPlaybackTimeForFailover = useCallback(() => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.currentTime) || el.currentTime <= 0) return
    pendingUrlFailoverSeekTimeRef.current = el.currentTime
  }, [videoRef])

  useEffect(() => {
    if (!videoUrl) return

    const el = videoRef.current
    if (!el) return

    const restoreFailoverPosition = () => {
      const pendingTime = pendingUrlFailoverSeekTimeRef.current
      if (pendingTime === null) return

      if (Number.isFinite(el.duration)) {
        el.currentTime = Math.min(pendingTime, Math.max(0, el.duration - 0.1))
      } else {
        el.currentTime = pendingTime
      }
      pendingUrlFailoverSeekTimeRef.current = null
    }

    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      restoreFailoverPosition()
    }

    el.addEventListener('loadedmetadata', restoreFailoverPosition)
    return () => el.removeEventListener('loadedmetadata', restoreFailoverPosition)
  }, [videoRef, videoUrl])

  useEffect(() => {
    if (!videoUrl || isHls) return

    const el = videoRef.current
    if (!el) return

    // If video is already playable, skip startup failover.
    // This prevents false triggers when the effect re-runs due to videoUrl
    // being set to the same value after URL regeneration.
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return

    let startupTimeout: ReturnType<typeof setTimeout> | null = null

    const clearStartupTimeout = () => {
      if (startupTimeout) {
        clearTimeout(startupTimeout)
        startupTimeout = null
      }
    }

    const handlePlayable = () => {
      clearStartupTimeout()
    }

    startupTimeout = setTimeout(() => {
      // Re-check: if the browser has a frame to render now, don't switch.
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return

      if (hasMoreVideoUrlsRef.current) {
        if (import.meta.env.DEV) {
          console.log(
            `Video startup timed out (${STARTUP_FAILOVER_TIMEOUT_MS}ms), trying next URL...`
          )
        }
        preserveCurrentPlaybackTimeForFailover()
        moveToNextVideoRef.current()
      }
    }, STARTUP_FAILOVER_TIMEOUT_MS)

    el.addEventListener('loadeddata', handlePlayable)
    el.addEventListener('canplay', handlePlayable)
    el.addEventListener('playing', handlePlayable)

    return () => {
      clearStartupTimeout()
      el.removeEventListener('loadeddata', handlePlayable)
      el.removeEventListener('canplay', handlePlayable)
      el.removeEventListener('playing', handlePlayable)
    }
  }, [isHls, preserveCurrentPlaybackTimeForFailover, videoUrl])

  useEffect(() => {
    if (!videoUrl || isHls) return

    const el = videoRef.current
    if (!el) return

    let recoveryTimeout: ReturnType<typeof setTimeout> | null = null
    let recoveryReason = 'media'

    const clearRecoveryTimeout = () => {
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout)
        recoveryTimeout = null
      }
    }

    const isRecovered = () => {
      const requiredReadyState = el.paused
        ? HTMLMediaElement.HAVE_CURRENT_DATA
        : HTMLMediaElement.HAVE_FUTURE_DATA
      return !el.seeking && el.readyState >= requiredReadyState
    }

    const clearIfRecovered = () => {
      if (isRecovered()) {
        clearRecoveryTimeout()
      }
    }

    const startRecoveryTimer = (reason: string) => {
      clearRecoveryTimeout()
      recoveryReason = reason

      recoveryTimeout = setTimeout(() => {
        if (isRecovered()) return

        if (hasMoreVideoUrlsRef.current) {
          if (import.meta.env.DEV) {
            console.log(
              `Video ${recoveryReason} recovery timed out (${STARTUP_FAILOVER_TIMEOUT_MS}ms), trying next URL...`
            )
          }
          preserveCurrentPlaybackTimeForFailover()
          moveToNextVideoRef.current()
        }
      }, STARTUP_FAILOVER_TIMEOUT_MS)
    }

    const handleSeeking = () => startRecoveryTimer('seek')
    const handleWaiting = () => startRecoveryTimer('buffer')

    el.addEventListener('seeking', handleSeeking)
    el.addEventListener('waiting', handleWaiting)
    el.addEventListener('seeked', clearIfRecovered)
    el.addEventListener('loadeddata', clearIfRecovered)
    el.addEventListener('canplay', clearIfRecovered)
    el.addEventListener('playing', clearRecoveryTimeout)

    return () => {
      clearRecoveryTimeout()
      el.removeEventListener('seeking', handleSeeking)
      el.removeEventListener('waiting', handleWaiting)
      el.removeEventListener('seeked', clearIfRecovered)
      el.removeEventListener('loadeddata', clearIfRecovered)
      el.removeEventListener('canplay', clearIfRecovered)
      el.removeEventListener('playing', clearRecoveryTimeout)
    }
  }, [isHls, preserveCurrentPlaybackTimeForFailover, videoRef, videoUrl])

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    // webkitbeginfullscreen / webkitendfullscreen fire on the video element when
    // webkitEnterFullscreen() is used (iPhone, older iPad) — standard fullscreenchange
    // does NOT fire in that path, so we need these to keep isFullscreen in sync.
    const handleWebkitBeginFullscreen = () => setIsFullscreen(true)
    const handleWebkitEndFullscreen = () => setIsFullscreen(false)

    const video = videoRef.current
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    video?.addEventListener('webkitbeginfullscreen', handleWebkitBeginFullscreen)
    video?.addEventListener('webkitendfullscreen', handleWebkitEndFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      video?.removeEventListener('webkitbeginfullscreen', handleWebkitBeginFullscreen)
      video?.removeEventListener('webkitendfullscreen', handleWebkitEndFullscreen)
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    const container = containerRef.current
    const video = videoRef.current
    if (!container || document.fullscreenElement) return

    try {
      // Prefer standard Fullscreen API — supported on desktop, iPad (iPadOS 16+), and modern browsers.
      // webkitEnterFullscreen exists on iPad too but silently fails when triggered from a button
      // click (requires gesture on the video element itself), so we only use it as a last resort
      // for older iPhone/iPad where requestFullscreen is unavailable.
      if (container.requestFullscreen) {
        await container.requestFullscreen()
        return
      }

      // Fallback: iPhone and older iPad where the standard API is not available
      if (!(video instanceof HTMLVideoElement)) return
      const videoEl = video as HTMLVideoElement & {
        webkitEnterFullscreen?: () => void
      }
      if (videoEl?.webkitEnterFullscreen) {
        videoEl.webkitEnterFullscreen()
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.log('Fullscreen error:', err)
      }
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      // Handle exit for webkit fullscreen path (iPhone, older iPad)
      const video = videoRef.current
      if (!(video instanceof HTMLVideoElement)) return
      const videoEl = video as HTMLVideoElement & {
        webkitExitFullscreen?: () => void
      }
      videoEl?.webkitExitFullscreen?.()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.log('Exit fullscreen error:', err)
      }
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const videoEl = videoRef.current as HTMLMediaElement & {
      webkitDisplayingFullscreen?: boolean
    }
    if (document.fullscreenElement || videoEl?.webkitDisplayingFullscreen) {
      await exitFullscreen()
    } else {
      await enterFullscreen()
    }
  }, [enterFullscreen, exitFullscreen])

  // Auto-fullscreen on orientation change (mobile only)
  useEffect(() => {
    if (!isMobile) return

    const handleOrientationChange = () => {
      const isLandscape = window.matchMedia('(orientation: landscape)').matches
      const video = videoRef.current

      if (isLandscape && video && !video.paused) {
        // Landscape + playing → enter fullscreen
        enterFullscreen()
      } else if (!isLandscape && document.fullscreenElement) {
        // Portrait + in fullscreen → exit fullscreen
        exitFullscreen()
      }
    }

    // Use screen.orientation API if available, fall back to matchMedia
    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange)
      return () => screen.orientation.removeEventListener('change', handleOrientationChange)
    } else {
      window.addEventListener('orientationchange', handleOrientationChange)
      return () => window.removeEventListener('orientationchange', handleOrientationChange)
    }
  }, [isMobile, enterFullscreen, exitFullscreen])

  // PiP handling
  const isPipSupported = 'pictureInPictureEnabled' in document
  const togglePip = useCallback(async () => {
    const el = videoRef.current
    if (!(el instanceof HTMLVideoElement)) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await el.requestPictureInPicture()
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.log('PiP error:', err)
      }
    }
  }, [])

  // Helper to apply subtitle language to video element tracks
  const applySubtitleLanguage = useCallback((lang: string) => {
    const el = videoRef.current
    if (!el) return

    const tracks = el.textTracks
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      // Show only the track matching the selected language
      track.mode = lang && track.language === lang ? 'showing' : 'hidden'
    }
  }, [])

  // Captions toggle button - toggle between showing selected language and off
  const toggleCaptions = useCallback(() => {
    const el = videoRef.current
    if (!el || validatedTracks.length === 0) return

    if (captionsEnabled) {
      // Turn off all captions
      applySubtitleLanguage('')
      setCaptionsEnabled(false)
    } else {
      // Turn on captions - use selected language or first available
      const langToShow = selectedSubtitleLang || validatedTracks[0]?.lang || ''
      if (langToShow) {
        setSelectedSubtitleLang(langToShow)
        applySubtitleLanguage(langToShow)
        setCaptionsEnabled(true)
      }
    }
  }, [captionsEnabled, selectedSubtitleLang, validatedTracks, applySubtitleLanguage])

  // Settings menu subtitle language change
  const handleSubtitleChange = useCallback(
    (lang: string) => {
      setSelectedSubtitleLang(lang)
      applySubtitleLanguage(lang)
      setCaptionsEnabled(lang !== '')
    },
    [applySubtitleLanguage]
  )

  // Touch overlay handlers - use accumulator for seek
  const handleSeekBackward = useCallback(() => {
    showControls()
    addSeek('backward')
  }, [showControls, addSeek])

  const handleSeekForward = useCallback(() => {
    showControls()
    addSeek('forward')
  }, [showControls, addSeek])

  // Keyboard shortcuts for player controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          userInitiatedRef.current = true
          if (playerState.isPlaying) {
            playerState.pause()
          } else {
            playerState.play()
          }
          break
        case 'm':
        case 'M':
          e.preventDefault()
          playerState.toggleMute()
          break
        case 'ArrowLeft':
          e.preventDefault()
          showControls()
          addSeek('backward')
          break
        case 'ArrowRight':
          e.preventDefault()
          showControls()
          addSeek('forward')
          break
        case 'j':
        case 'J':
          e.preventDefault()
          showControls()
          addSeek('backward', 10)
          break
        case 'l':
        case 'L':
          e.preventDefault()
          showControls()
          addSeek('forward', 10)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'p':
        case 'P':
          e.preventDefault()
          togglePip()
          break
        case 't':
        case 'T':
          e.preventDefault()
          onToggleCinemaMode?.()
          break
        default: {
          const digit = parseInt(e.key, 10)
          if (!isNaN(digit) && e.key >= '0' && e.key <= '9' && playerState.duration > 0) {
            e.preventDefault()
            showControls()
            playerState.seek((digit / 10) * playerState.duration)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    playerState,
    addSeek,
    showControls,
    toggleFullscreen,
    togglePip,
    toggleCaptions,
    onToggleCinemaMode,
  ])

  const handleTogglePlay = useCallback(() => {
    userInitiatedRef.current = true
    if (playerState.isPlaying) {
      playerState.pause()
    } else {
      playerState.play()
    }
  }, [playerState])

  // Memoized play/pause handlers for ControlBar
  const handlePlay = useCallback(() => {
    userInitiatedRef.current = true
    playerState.play()
  }, [playerState])

  const handlePause = useCallback(() => {
    userInitiatedRef.current = true
    playerState.pause()
  }, [playerState])

  // Mouse move handler for showing controls
  // Skip on mobile - touch interactions are handled by TouchOverlay
  // This prevents iOS from keeping the home indicator visible during fullscreen
  const handleMouseMove = useCallback(() => {
    if (isMobile) return
    showControls()
  }, [showControls, isMobile])

  // Get poster URL with blossom fallback support (no resize proxy)
  const posterUrls = useMemo(() => (poster ? [poster] : []), [poster])
  const { ladder: posterUrlLadder } = useMediaUrls({
    urls: posterUrls,
    mediaType: 'image',
    sha256: posterHash,
    enabled: !!poster,
  })
  const posterUrl = posterUrlLadder.currentUrl

  // Media Session API - lock screen / Control Center controls + background audio
  useMediaSession({
    title,
    artist: authorName,
    artwork: posterUrl ?? undefined,
    isPlaying: playerState.isPlaying,
    currentTime: playerState.currentTime,
    duration: playerState.duration,
    playbackRate: playerState.playbackRate,
    play: playerState.play,
    pause: playerState.pause,
    seek: playerState.seek,
    onPreviousTrack,
    onNextTrack,
  })

  // Generate blurhash placeholder for poster LQIP (Low Quality Image Placeholder)
  const blurhashPlaceholder = useMemo(() => blurHashToDataURL(posterHash), [posterHash])

  // Track poster loading state
  const [posterLoaded, setPosterLoaded] = useState(false)

  // Preload poster image and track when it's loaded
  useEffect(() => {
    if (!posterUrl) {
      // Use microtask to avoid synchronous setState in effect
      queueMicrotask(() => setPosterLoaded(false))
      return
    }

    // Reset state when URL changes (use microtask to avoid synchronous setState)
    queueMicrotask(() => setPosterLoaded(false))

    const img = new Image()
    img.onload = () => setPosterLoaded(true)
    img.onerror = () => setPosterLoaded(true) // Still mark as "loaded" on error to hide blurhash
    img.src = posterUrl

    // Cleanup when poster URL changes
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [posterUrl])

  const hasCaptions = validatedTracks.length > 0
  const showPipButton = isPipSupported && !isAudioOnly
  const controlsVisibleForRender = isAudioOnly ? true : controlsVisible

  return (
    <div
      ref={containerRef}
      style={style}
      className={`relative bg-black overflow-hidden ${className || ''} ${
        !controlsVisibleForRender && playerState.isPlaying ? 'cursor-none' : ''
      } ${effectiveCinemaMode && !isFullscreen ? 'flex items-center justify-center' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {}}
    >
      {/* Blurhash placeholder shown while poster loads */}
      {blurhashPlaceholder && !posterLoaded && (
        <img
          src={blurhashPlaceholder}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover ${effectiveCinemaMode && !isFullscreen ? 'max-h-[80dvh]' : ''}`}
        />
      )}

      {isAudioOnly ? (
        <>
          {posterUrl && (
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-black p-0"
              onClick={handleTogglePlay}
              aria-label={playerState.isPlaying ? 'Pause audio' : 'Play audio'}
            >
              <img src={posterUrl} alt="" className="h-full w-full object-contain" />
            </button>
          )}
          {!posterUrl && (
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-black p-0"
              onClick={handleTogglePlay}
              aria-label={playerState.isPlaying ? 'Pause audio' : 'Play audio'}
            >
              <img src={audioFallback} alt="" className="h-full w-full object-contain" />
            </button>
          )}
          <audio
            ref={setMediaElementRef}
            src={engine.managedSource ? undefined : engine.elementSrc}
            loop={loopEnabled}
            autoPlay={!contentWarning}
            playsInline
            crossOrigin="anonymous"
            className="absolute h-px w-px opacity-0 pointer-events-none"
            onError={handleVideoError}
          >
            {validatedTracks.map(track => (
              <track
                key={track.lang}
                kind="captions"
                srcLang={track.lang}
                src={track.validatedUrl}
              />
            ))}
          </audio>
        </>
      ) : (
        <video
          ref={setMediaElementRef}
          src={engine.managedSource ? undefined : engine.elementSrc}
          poster={posterUrl ?? undefined}
          loop={loopEnabled}
          autoPlay={!contentWarning}
          playsInline
          crossOrigin="anonymous"
          className={`w-full object-contain ${effectiveCinemaMode && !isFullscreen ? 'max-h-[80dvh]' : 'h-full'}`}
          onError={handleVideoError}
          onClick={handleTogglePlay}
        >
          {validatedTracks.map(track => (
            <track key={track.lang} kind="captions" srcLang={track.lang} src={track.validatedUrl} />
          ))}
        </video>
      )}

      {/* Loading spinner */}
      <LoadingSpinner isVisible={showBufferingSpinner} />

      {/* Bullet comments (danmaku) - disabled for now
      <BulletComments
        isPlaying={playerState.isPlaying}
        currentTime={playerState.currentTime}
        videoDuration={playerState.duration}
      />
      */}

      {/* Play/Pause overlay */}
      <PlayPauseOverlay videoRef={videoRef} userInitiatedRef={userInitiatedRef} />

      {/* Seek indicator for accumulated seeks */}
      <SeekIndicator
        accumulatedTime={accumulatedTime}
        isVisible={isAccumulating}
        direction={direction}
      />

      {/* Touch overlay for mobile */}
      {isMobile && (
        <TouchOverlay
          onSeekBackward={handleSeekBackward}
          onSeekForward={handleSeekForward}
          onTogglePlay={handleTogglePlay}
          onShowControls={showControls}
        />
      )}

      {/* Control bar */}
      <ControlBar
        isVisible={controlsVisibleForRender}
        isPlaying={playerState.isPlaying}
        currentTime={playerState.currentTime}
        duration={playerState.duration}
        bufferedPercentage={playerState.bufferedPercentage}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={playerState.seek}
        onSeekingChange={handleSeekingChange}
        volume={playerState.volume}
        isMuted={playerState.isMuted}
        onVolumeChange={playerState.setVolume}
        onToggleMute={playerState.toggleMute}
        playbackRate={playerState.playbackRate}
        onPlaybackRateChange={playerState.setPlaybackRate}
        qualityOptions={engine.qualityOptions}
        selectedQuality={engine.selectedQuality}
        activeQualityLabel={engine.activeQualityLabel}
        onSelectQuality={engine.selectQuality}
        hasCaptions={hasCaptions}
        captionsEnabled={captionsEnabled}
        onToggleCaptions={toggleCaptions}
        textTracks={validatedTracks}
        selectedSubtitleLang={selectedSubtitleLang}
        onSubtitleChange={handleSubtitleChange}
        isPipSupported={showPipButton}
        onTogglePip={togglePip}
        cinemaMode={effectiveCinemaMode}
        onToggleCinemaMode={isAudioOnly ? undefined : onToggleCinemaMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        eventId={eventId}
        authorPubkey={authorPubkey}
        chapters={chapters}
        showTimelineMarkers={showTimelineMarkers}
        loopEnabled={loopEnabled}
        onToggleLoop={toggleLoop}
      />
    </div>
  )
})

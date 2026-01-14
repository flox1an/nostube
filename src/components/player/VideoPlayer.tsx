import * as React from 'react'
import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { type TextTrack, type VideoVariant } from '@/utils/video-event'
import { Loader2 } from 'lucide-react'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { useIsMobile } from '@/hooks'
import {
  useHls,
  usePlayerState,
  useControlsVisibility,
  useSeekAccumulator,
  useAdaptiveQuality,
  useValidatedTextTracks,
  useVideoVariantSelector,
} from './hooks'
import { ControlBar } from './ControlBar'
import { LoadingSpinner } from './LoadingSpinner'
import { TouchOverlay } from './TouchOverlay'
import { SeekIndicator } from './SeekIndicator'
import { PlayPauseOverlay } from '../PlayPauseOverlay'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
// import { BulletComments } from './BulletComments' // disabled for now

interface VideoPlayerProps {
  urls: string[]
  loop?: boolean
  textTracks: TextTrack[]
  mime: string
  poster?: string
  posterHash?: string
  onTimeUpdate?: (time: number) => void
  className?: string
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
  onVideoElementReady?: (element: HTMLVideoElement | null) => void
  videoVariants?: VideoVariant[]
}

const LOOP_STORAGE_KEY = 'nostube:video-loop'

export const VideoPlayer = React.memo(function VideoPlayer({
  urls,
  mime,
  poster,
  posterHash,
  textTracks,
  loop: loopProp = false,
  onTimeUpdate,
  className,
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
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
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
  const spinnerTimeoutRef = useRef<number | null>(null)
  const userInitiatedRef = useRef(false)
  const isMobile = useIsMobile()

  // Video quality variant selector with position preservation
  const {
    selectedVariantIndex,
    effectiveUrls,
    effectiveSha256,
    handleVariantChange,
  } = useVideoVariantSelector({
    videoRef,
    videoVariants,
    urls,
    sha256,
  })

  // Store callbacks in refs to avoid dependency issues
  const onAllSourcesFailedRef = useRef(onAllSourcesFailed)
  const urlsRef = useRef(urls)
  useEffect(() => {
    onAllSourcesFailedRef.current = onAllSourcesFailed
    urlsRef.current = urls
  }, [onAllSourcesFailed, urls])

  // Video URL failover
  const handleVideoUrlError = useCallback((error: Error) => {
    console.error('Video URL failover error:', error)
  }, [])

  // Memoize proxyConfig to prevent infinite loops
  const proxyConfig = useMemo(() => ({ enabled: true }), [])

  const {
    currentUrl: videoUrl,
    moveToNext: moveToNextVideo,
    hasMore: hasMoreVideoUrls,
    isLoading: isLoadingVideoUrls,
  } = useMediaUrls({
    urls: effectiveUrls,
    mediaType: 'video',
    sha256: effectiveSha256,
    kind: 34235,
    authorPubkey,
    proxyConfig,
    onError: handleVideoUrlError,
  })

  // Notify parent when all sources fail
  useEffect(() => {
    if (!hasMoreVideoUrls && !isLoadingVideoUrls && videoUrl === null) {
      onAllSourcesFailedRef.current?.(urlsRef.current)
    }
  }, [hasMoreVideoUrls, isLoadingVideoUrls, videoUrl])

  // Determine if HLS
  const isHls = useMemo(
    () => mime === 'application/vnd.apple.mpegurl' || (videoUrl?.endsWith('.m3u8') ?? false),
    [mime, videoUrl]
  )

  // Initialize HLS
  const {
    levels: hlsLevels,
    currentLevel: hlsCurrentLevel,
    setLevel: setHlsLevel,
  } = useHls(videoRef, videoUrl, isHls)

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
      // Use ref to get latest value, avoiding stale closure issues
      const pos = initialPlayPosRef.current
      if (pos > 0 && Math.abs(el.currentTime - pos) > 1) {
        el.currentTime = pos
        hasSetInitialPos.current = true
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
    if (!el || contentWarning) return

    const attemptAutoplay = async () => {
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
      // Wait for canplay event
      el.addEventListener('canplay', attemptAutoplay, { once: true })
      return () => el.removeEventListener('canplay', attemptAutoplay)
    }
  }, [videoUrl, contentWarning])

  // Notify parent when video element is ready
  useEffect(() => {
    onVideoElementReady?.(videoRef.current)
  }, [onVideoElementReady])

  // Detect video dimensions
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const handleLoadedMetadata = () => {
      if (onVideoDimensionsLoaded && el.videoWidth > 0 && el.videoHeight > 0) {
        onVideoDimensionsLoaded(el.videoWidth, el.videoHeight)
      }
    }

    el.addEventListener('loadedmetadata', handleLoadedMetadata)
    if (el.readyState >= 1 && el.videoWidth > 0 && el.videoHeight > 0) {
      handleLoadedMetadata()
    }

    return () => el.removeEventListener('loadedmetadata', handleLoadedMetadata)
  }, [onVideoDimensionsLoaded])

  // Handle buffering spinner
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const showSpinnerDelayed = () => {
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
      spinnerTimeoutRef.current = window.setTimeout(() => {
        setShowBufferingSpinner(true)
      }, 200)
    }

    const hideSpinner = () => {
      setShowBufferingSpinner(false)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
        spinnerTimeoutRef.current = null
      }
    }

    el.addEventListener('loadstart', showSpinnerDelayed)
    el.addEventListener('waiting', showSpinnerDelayed)
    el.addEventListener('canplay', hideSpinner)
    el.addEventListener('playing', hideSpinner)

    return () => {
      el.removeEventListener('loadstart', showSpinnerDelayed)
      el.removeEventListener('waiting', showSpinnerDelayed)
      el.removeEventListener('canplay', hideSpinner)
      el.removeEventListener('playing', hideSpinner)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
    }
  }, [])

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

  // Stall detection - move to next URL if loading takes too long
  useEffect(() => {
    if (!videoUrl || !hasMoreVideoUrls) return

    const el = videoRef.current
    if (!el) return

    let stallTimeout: ReturnType<typeof setTimeout> | null = null
    let hasStartedLoading = false

    const clearStallTimeout = () => {
      if (stallTimeout) {
        clearTimeout(stallTimeout)
        stallTimeout = null
      }
    }

    const handleLoadProgress = () => {
      hasStartedLoading = true
      clearStallTimeout()
    }

    const startStallDetection = () => {
      clearStallTimeout()
      hasStartedLoading = false

      // If no progress within 5 seconds, try next URL
      stallTimeout = setTimeout(() => {
        if (!hasStartedLoading && hasMoreVideoUrls) {
          if (import.meta.env.DEV) {
            console.log('Video stalled (no progress in 5s), trying next URL...')
          }
          moveToNextVideo()
        }
      }, 5000)
    }

    // Start stall detection when URL changes
    startStallDetection()

    // Cancel stall detection when we get progress
    el.addEventListener('loadedmetadata', handleLoadProgress)
    el.addEventListener('canplay', handleLoadProgress)
    el.addEventListener('progress', handleLoadProgress)

    return () => {
      clearStallTimeout()
      el.removeEventListener('loadedmetadata', handleLoadProgress)
      el.removeEventListener('canplay', handleLoadProgress)
      el.removeEventListener('progress', handleLoadProgress)
    }
  }, [videoUrl, hasMoreVideoUrls, moveToNextVideo])

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const enterFullscreen = useCallback(async () => {
    const container = containerRef.current
    const video = videoRef.current
    if (!container || document.fullscreenElement) return

    try {
      // iOS Safari doesn't support Fullscreen API on containers
      // Use webkit fullscreen on video element instead
      const videoEl = video as HTMLVideoElement & {
        webkitEnterFullscreen?: () => void
      }
      if (videoEl?.webkitEnterFullscreen) {
        videoEl.webkitEnterFullscreen()
        return
      }

      await container.requestFullscreen()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.log('Fullscreen error:', err)
      }
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) return

    try {
      await document.exitFullscreen()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.log('Exit fullscreen error:', err)
      }
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
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
    if (!el) return

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
        case 'c':
        case 'C':
          e.preventDefault()
          toggleCaptions()
          break
        case 't':
        case 'T':
          e.preventDefault()
          onToggleCinemaMode?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playerState, addSeek, showControls, toggleFullscreen, toggleCaptions, onToggleCinemaMode])

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
  const { currentUrl: posterUrl } = useMediaUrls({
    urls: posterUrls,
    mediaType: 'image',
    sha256: posterHash,
    enabled: !!poster,
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

  // Show loading state if video URLs are still loading
  if (isLoadingVideoUrls || !videoUrl) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-32 w-32 animate-spin" />
      </div>
    )
  }

  const hasCaptions = validatedTracks.length > 0

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden ${className || ''} ${
        !controlsVisible && playerState.isPlaying ? 'cursor-none' : ''
      } ${cinemaMode && !isFullscreen ? 'flex items-center justify-center' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {}}
    >
      {/* Blurhash placeholder shown while poster loads */}
      {blurhashPlaceholder && !posterLoaded && (
        <img
          src={blurhashPlaceholder}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover ${cinemaMode && !isFullscreen ? 'max-h-[80dvh]' : ''}`}
        />
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        src={isHls ? undefined : videoUrl}
        poster={posterUrl ?? undefined}
        loop={loopEnabled}
        autoPlay={!contentWarning}
        playsInline
        crossOrigin="anonymous"
        className={`w-full object-contain ${cinemaMode && !isFullscreen ? 'max-h-[80dvh]' : 'h-full'}`}
        onError={handleVideoError}
        onClick={handleTogglePlay}
      >
        {validatedTracks.map(track => (
          <track key={track.lang} kind="captions" srcLang={track.lang} src={track.validatedUrl} />
        ))}
      </video>

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
        isVisible={controlsVisible}
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
        isHls={isHls}
        hlsLevels={hlsLevels}
        hlsCurrentLevel={hlsCurrentLevel}
        onHlsLevelChange={setHlsLevel}
        videoVariants={videoVariants}
        selectedVariantIndex={selectedVariantIndex}
        onVariantChange={handleVariantChange}
        hasCaptions={hasCaptions}
        captionsEnabled={captionsEnabled}
        onToggleCaptions={toggleCaptions}
        textTracks={validatedTracks}
        selectedSubtitleLang={selectedSubtitleLang}
        onSubtitleChange={handleSubtitleChange}
        isPipSupported={isPipSupported}
        onTogglePip={togglePip}
        cinemaMode={cinemaMode}
        onToggleCinemaMode={onToggleCinemaMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        eventId={eventId}
        authorPubkey={authorPubkey}
        loopEnabled={loopEnabled}
        onToggleLoop={toggleLoop}
      />
    </div>
  )
})

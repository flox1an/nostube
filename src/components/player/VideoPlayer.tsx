import * as React from 'react'
import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { type TextTrack, type VideoVariant } from '@/utils/video-event'
import { imageProxyVideoPreview } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { useIsMobile } from '@/hooks'
import { useHls } from './hooks/useHls'
import { usePlayerState } from './hooks/usePlayerState'
import { useControlsVisibility } from './hooks/useControlsVisibility'
import { useSeekAccumulator } from './hooks/useSeekAccumulator'
import { useAdaptiveQuality } from './hooks/useAdaptiveQuality'
import { ControlBar } from './ControlBar'
import { LoadingSpinner } from './LoadingSpinner'
import { TouchOverlay } from './TouchOverlay'
import { SeekIndicator } from './SeekIndicator'
import { PlayPauseOverlay } from '../PlayPauseOverlay'

interface VideoPlayerProps {
  urls: string[]
  loop?: boolean
  textTracks: TextTrack[]
  mime: string
  poster?: string
  onTimeUpdate?: (time: number) => void
  className?: string
  contentWarning?: string
  sha256?: string
  authorPubkey?: string
  initialPlayPos?: number
  onAllSourcesFailed?: (urls: string[]) => void
  cinemaMode?: boolean
  onToggleCinemaMode?: () => void
  onVideoDimensionsLoaded?: (width: number, height: number) => void
  onEnded?: () => void
  onVideoElementReady?: (element: HTMLVideoElement | null) => void
  videoVariants?: VideoVariant[]
}

export const VideoPlayer = React.memo(function VideoPlayer({
  urls,
  mime,
  poster,
  textTracks,
  loop = false,
  onTimeUpdate,
  className,
  contentWarning,
  sha256,
  authorPubkey,
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
  const spinnerTimeoutRef = useRef<number | null>(null)
  const userInitiatedRef = useRef(false)
  const isMobile = useIsMobile()

  // Compute default quality index: prefer 1080p, then 720p, else first
  const defaultQualityIndex = useMemo(() => {
    if (!videoVariants || videoVariants.length === 0) return 0
    const idx1080 = videoVariants.findIndex(v => v.quality === '1080p')
    if (idx1080 !== -1) return idx1080
    const idx720 = videoVariants.findIndex(v => v.quality === '720p')
    if (idx720 !== -1) return idx720
    return 0
  }, [videoVariants])

  const [selectedVariantIndex, setSelectedVariantIndex] = useState(defaultQualityIndex)
  const pendingSeekTimeRef = useRef<number | null>(null)
  const wasPlayingRef = useRef(false)

  // Compute URLs based on selected variant
  const effectiveUrls = useMemo(() => {
    if (videoVariants && videoVariants.length > 0 && selectedVariantIndex < videoVariants.length) {
      const variant = videoVariants[selectedVariantIndex]
      return [variant.url, ...variant.fallbackUrls]
    }
    return urls
  }, [videoVariants, selectedVariantIndex, urls])

  const effectiveSha256 = useMemo(() => {
    if (videoVariants && videoVariants.length > 0 && selectedVariantIndex < videoVariants.length) {
      return videoVariants[selectedVariantIndex].hash || sha256
    }
    return sha256
  }, [videoVariants, selectedVariantIndex, sha256])

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

  // Player state
  const playerState = usePlayerState({
    videoRef,
    onTimeUpdate,
  })

  // Controls visibility
  const { isVisible: controlsVisible, showControls } = useControlsVisibility({
    isPlaying: playerState.isPlaying,
    hideDelay: 2000,
  })

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

  // Handle quality change
  const handleVariantChange = useCallback(
    (newIndex: number) => {
      if (newIndex === selectedVariantIndex) return

      const el = videoRef.current
      if (el) {
        pendingSeekTimeRef.current = el.currentTime
        wasPlayingRef.current = !el.paused
      }
      setSelectedVariantIndex(newIndex)
    },
    [selectedVariantIndex]
  )

  // Restore playback position after quality change
  useEffect(() => {
    if (pendingSeekTimeRef.current === null) return

    const el = videoRef.current
    if (!el) return

    const handleCanPlay = () => {
      if (pendingSeekTimeRef.current !== null) {
        el.currentTime = pendingSeekTimeRef.current
        pendingSeekTimeRef.current = null
        if (wasPlayingRef.current) {
          el.play().catch(() => {})
        }
      }
    }

    el.addEventListener('canplay', handleCanPlay, { once: true })
    return () => el.removeEventListener('canplay', handleCanPlay)
  }, [selectedVariantIndex])

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

  // Captions handling
  const toggleCaptions = useCallback(() => {
    const el = videoRef.current
    if (!el) return

    const tracks = el.textTracks
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = captionsEnabled ? 'hidden' : 'showing'
    }
    setCaptionsEnabled(!captionsEnabled)
  }, [captionsEnabled])

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
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playerState, addSeek, showControls, toggleFullscreen])

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
  const handleMouseMove = useCallback(() => {
    showControls()
  }, [showControls])

  const posterUrl = useMemo(
    () => (poster !== undefined ? imageProxyVideoPreview(poster) : undefined),
    [poster]
  )

  // Show loading state if video URLs are still loading
  if (isLoadingVideoUrls || !videoUrl) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-32 w-32 animate-spin" />
      </div>
    )
  }

  const hasCaptions = textTracks.length > 0

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden ${className || ''} ${
        !controlsVisible && playerState.isPlaying ? 'cursor-none' : ''
      } ${cinemaMode ? 'flex items-center justify-center' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {}}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={isHls ? undefined : videoUrl}
        poster={posterUrl}
        loop={loop}
        autoPlay={!contentWarning}
        playsInline
        crossOrigin="anonymous"
        className={`w-full object-contain ${cinemaMode ? 'max-h-[85dvh]' : 'h-full'}`}
        onError={handleVideoError}
        onClick={handleTogglePlay}
      >
        {textTracks.map(track => (
          <track key={track.lang} kind="captions" srcLang={track.lang} src={track.url} />
        ))}
      </video>

      {/* Loading spinner */}
      <LoadingSpinner isVisible={showBufferingSpinner} />

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
        isPipSupported={isPipSupported}
        onTogglePip={togglePip}
        cinemaMode={cinemaMode}
        onToggleCinemaMode={onToggleCinemaMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        isMobile={isMobile}
      />
    </div>
  )
})

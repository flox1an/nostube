import * as React from 'react'
import { useRef, useEffect, useCallback, useState } from 'react'
import 'media-chrome'
import 'hls-video-element'
import { type TextTrack } from '@/utils/video-event'
import { getLanguageLabel, imageProxyVideoPreview } from '@/lib/utils'
import 'media-chrome/menu'
import '@/types/media-chrome.d.ts'
import { Loader2 } from 'lucide-react'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { useIsMobile } from '../hooks'

interface VideoPlayerProps {
  urls: string[]
  loop?: boolean
  textTracks: TextTrack[]
  mime: string
  poster?: string
  onTimeUpdate?: (time: number) => void
  className?: string
  contentWarning?: string
  /**
   * SHA256 hash of the video file (for discovery)
   */
  sha256?: string
  /**
   * Author pubkey (npub or hex) for AS query parameter in proxy URLs
   */
  authorPubkey?: string
  /**
   * Initial play position in seconds
   */
  initialPlayPos?: number
  /**
   * Callback when all video sources fail to load
   */
  onAllSourcesFailed?: (urls: string[]) => void
  /**
   * Cinema mode state and toggle
   */
  cinemaMode?: boolean
  onToggleCinemaMode?: () => void
  /**
   * Callback when video dimensions are loaded
   */
  onVideoDimensionsLoaded?: (width: number, height: number) => void
  /**
   * Callback when playback finishes
   */
  onEnded?: () => void
  /**
   * Callback when video element is ready
   */
  onVideoElementReady?: (element: HTMLVideoElement | null) => void
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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hlsEl, setHlsEl] = useState<HTMLVideoElement | null>(null)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimeoutRef = useRef<number | null>(null)
  const isMobile = useIsMobile()
  const [showPlayPauseIcon, setShowPlayPauseIcon] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const playPauseTimeoutRef = useRef<number | null>(null)
  const fadeOutTimeoutRef = useRef<number | null>(null)

  // Memoize proxyConfig to prevent infinite loops
  const proxyConfig = React.useMemo(
    () => ({
      enabled: true, // Enable proxy for videos
    }),
    []
  )

  // Store onAllSourcesFailed in ref to avoid dependency issues
  const onAllSourcesFailedRef = React.useRef(onAllSourcesFailed)
  const urlsRef = React.useRef(urls)
  React.useEffect(() => {
    onAllSourcesFailedRef.current = onAllSourcesFailed
    urlsRef.current = urls
  }, [onAllSourcesFailed, urls])

  // Memoize onError callback to prevent recreating it on every render
  const handleVideoUrlError = React.useCallback((error: Error) => {
    console.error('Video URL failover error:', error)
    // Note: We can't check hasMoreVideoUrls here as it's from the hook result
    // The hook will handle calling onAllSourcesFailed when appropriate
  }, [])

  // Use new media URL failover system for video
  const {
    currentUrl: videoUrl,
    moveToNext: moveToNextVideo,
    hasMore: hasMoreVideoUrls,
    isLoading: isLoadingVideoUrls,
  } = useMediaUrls({
    urls,
    mediaType: 'video',
    sha256,
    kind: 34235, // NIP-71 video event kind
    authorPubkey,
    proxyConfig,
    onError: handleVideoUrlError,
  })

  // Notify parent when all sources have failed
  React.useEffect(() => {
    if (!hasMoreVideoUrls && !isLoadingVideoUrls && videoUrl === null) {
      onAllSourcesFailedRef.current?.(urlsRef.current)
    }
  }, [hasMoreVideoUrls, isLoadingVideoUrls, videoUrl])

  const isHls = React.useMemo(
    () => mime === 'application/vnd.apple.mpegurl' || videoUrl?.endsWith('.m3u8'),
    [mime, videoUrl]
  )

  // Notify parent when video element is ready (only when element actually changes)
  const lastNotifiedElementRef = useRef<HTMLVideoElement | null>(null)
  const onVideoElementReadyRef = useRef(onVideoElementReady)

  // Keep ref in sync with callback
  useEffect(() => {
    onVideoElementReadyRef.current = onVideoElementReady
  }, [onVideoElementReady])

  // Reset when URLs change (new video)
  useEffect(() => {
    lastNotifiedElementRef.current = null
    // Reset play/pause overlay state
    setShowPlayPauseIcon(false)
    setIsPaused(false)
    setIsFadingOut(false)
    if (playPauseTimeoutRef.current !== null) {
      clearTimeout(playPauseTimeoutRef.current)
      playPauseTimeoutRef.current = null
    }
    if (fadeOutTimeoutRef.current !== null) {
      clearTimeout(fadeOutTimeoutRef.current)
      fadeOutTimeoutRef.current = null
    }
  }, [urls])

  // Notify parent when element is ready (only once per element)
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current

    // Only notify if element changed and we haven't notified for this element yet
    if (el && el !== lastNotifiedElementRef.current && onVideoElementReadyRef.current) {
      lastNotifiedElementRef.current = el
      // Use requestAnimationFrame to defer the callback to avoid triggering during render
      requestAnimationFrame(() => {
        // Double-check the element is still the same before calling
        const currentEl = isHls ? hlsEl : videoRef.current
        if (
          currentEl === el &&
          lastNotifiedElementRef.current === el &&
          onVideoElementReadyRef.current
        ) {
          onVideoElementReadyRef.current(el)
        }
      })
    }
  }, [isHls, hlsEl])

  // Track if we've already set the initial position
  const hasSetInitialPos = useRef(false)

  // Set initial play position on mount
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el || hasSetInitialPos.current) return
    if (initialPlayPos > 0) {
      // Only seek if the difference is significant (e.g., >1s)
      if (Math.abs(el.currentTime - initialPlayPos) > 1) {
        el.currentTime = initialPlayPos
        hasSetInitialPos.current = true
      }
    }
  }, [initialPlayPos, isHls, hlsEl])

  // Reset the flag when URLs change (new video)
  useEffect(() => {
    hasSetInitialPos.current = false
  }, [urls])

  // Detect video dimensions when metadata is loaded
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    const handleLoadedMetadata = () => {
      if (onVideoDimensionsLoaded && el.videoWidth > 0 && el.videoHeight > 0) {
        onVideoDimensionsLoaded(el.videoWidth, el.videoHeight)
      }
    }

    el.addEventListener('loadedmetadata', handleLoadedMetadata)

    // If metadata is already loaded, call immediately
    if (el.readyState >= 1 && el.videoWidth > 0 && el.videoHeight > 0) {
      handleLoadedMetadata()
    }

    return () => {
      el.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [isHls, hlsEl, onVideoDimensionsLoaded])

  // Handle video loading state and spinner display
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    const handleLoadStart = () => {
      // Start timer to show spinner after 200ms
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
      spinnerTimeoutRef.current = window.setTimeout(() => {
        setShowSpinner(true)
      }, 200)
    }

    const handleWaiting = () => {
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
      spinnerTimeoutRef.current = window.setTimeout(() => {
        setShowSpinner(true)
      }, 200)
    }

    const handleCanPlay = () => {
      setShowSpinner(false)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
        spinnerTimeoutRef.current = null
      }
    }

    const handlePlaying = () => {
      setShowSpinner(false)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
        spinnerTimeoutRef.current = null
      }
    }

    el.addEventListener('loadstart', handleLoadStart)
    el.addEventListener('waiting', handleWaiting)
    el.addEventListener('canplay', handleCanPlay)
    el.addEventListener('playing', handlePlaying)

    return () => {
      el.removeEventListener('loadstart', handleLoadStart)
      el.removeEventListener('waiting', handleWaiting)
      el.removeEventListener('canplay', handleCanPlay)
      el.removeEventListener('playing', handlePlaying)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
    }
  }, [isHls, hlsEl])

  // Ref callback for hls-video custom element
  const hlsElRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useCallback((node: Element | null) => {
    const newEl = node && 'currentTime' in node ? (node as HTMLVideoElement) : null
    // Only update state if the element actually changed
    if (newEl !== hlsElRef.current) {
      hlsElRef.current = newEl
      setHlsEl(newEl)
    }
  }, [])

  // Throttle time updates to reduce re-renders (from ~4Hz to ~1Hz)
  const lastTimeUpdateRef = useRef<number>(0)
  const handleTimeUpdate = useCallback(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (onTimeUpdate && el) {
      const now = Date.now()
      // Only update once per second (1000ms) instead of every 250ms
      if (now - lastTimeUpdateRef.current >= 1000) {
        lastTimeUpdateRef.current = now
        onTimeUpdate(el.currentTime)
      }
    }
  }, [onTimeUpdate, isHls, hlsEl])

  const handleEndedEvent = useCallback(() => {
    if (onEnded) {
      onEnded()
    }
  }, [onEnded])

  // Handle video error: try next URL in failover chain
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

  const hasCaptions = textTracks.length > 0

  const posterUrl = React.useMemo(
    () => (poster !== undefined ? imageProxyVideoPreview(poster) : undefined),
    [poster]
  )

  useEffect(() => {
    if (!onEnded) return
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return
    el.addEventListener('ended', handleEndedEvent)
    return () => {
      el.removeEventListener('ended', handleEndedEvent)
    }
  }, [onEnded, isHls, hlsEl, handleEndedEvent])

  // Handle play/pause events to show icon overlay
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    const handlePlay = () => {
      setIsPaused(false)
      setIsFadingOut(false)
      setShowPlayPauseIcon(true)
      // Clear existing timeouts
      if (playPauseTimeoutRef.current !== null) {
        clearTimeout(playPauseTimeoutRef.current)
      }
      if (fadeOutTimeoutRef.current !== null) {
        clearTimeout(fadeOutTimeoutRef.current)
      }
      // Start fade-out after 1 second
      playPauseTimeoutRef.current = window.setTimeout(() => {
        setIsFadingOut(true)
        // Hide icon after fade-out completes (100ms)
        fadeOutTimeoutRef.current = window.setTimeout(() => {
          setShowPlayPauseIcon(false)
          setIsFadingOut(false)
          playPauseTimeoutRef.current = null
          fadeOutTimeoutRef.current = null
        }, 100)
      }, 700)
    }

    const handlePause = () => {
      setIsPaused(true)
      setIsFadingOut(false)
      setShowPlayPauseIcon(true)
      // Clear existing timeouts
      if (playPauseTimeoutRef.current !== null) {
        clearTimeout(playPauseTimeoutRef.current)
      }
      if (fadeOutTimeoutRef.current !== null) {
        clearTimeout(fadeOutTimeoutRef.current)
      }
      // Start fade-out after 1 second
      playPauseTimeoutRef.current = window.setTimeout(() => {
        setIsFadingOut(true)
        // Hide icon after fade-out completes (100ms)
        fadeOutTimeoutRef.current = window.setTimeout(() => {
          setShowPlayPauseIcon(false)
          setIsFadingOut(false)
          playPauseTimeoutRef.current = null
          fadeOutTimeoutRef.current = null
        }, 100)
      }, 700)
    }

    el.addEventListener('play', handlePlay)
    el.addEventListener('pause', handlePause)

    // Initialize paused state
    setIsPaused(el.paused)

    return () => {
      el.removeEventListener('play', handlePlay)
      el.removeEventListener('pause', handlePause)
      if (playPauseTimeoutRef.current !== null) {
        clearTimeout(playPauseTimeoutRef.current)
      }
      if (fadeOutTimeoutRef.current !== null) {
        clearTimeout(fadeOutTimeoutRef.current)
      }
    }
  }, [isHls, hlsEl])

  // Handle automatic fullscreen on orientation change for mobile devices
  useEffect(() => {
    if (!isMobile) return

    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    const handleOrientationChange = async () => {
      try {
        // Check if we're in landscape orientation
        const isLandscape =
          window.screen.orientation.type === 'landscape-primary' ||
          window.screen.orientation.type === 'landscape-secondary'

        if (isLandscape) {
          // Enter fullscreen when in landscape
          if (!document.fullscreenElement) {
            if (el.requestFullscreen) {
              await el.requestFullscreen()
            } else if ((el as any).webkitRequestFullscreen) {
              // Safari support
              await (el as any).webkitRequestFullscreen()
            }
          }
        } else {
          // Exit fullscreen when in portrait
          if (document.fullscreenElement) {
            if (document.exitFullscreen) {
              await document.exitFullscreen()
            } else if ((document as any).webkitExitFullscreen) {
              // Safari support
              await (document as any).webkitExitFullscreen()
            }
          }
        }
      } catch (err) {
        // Silently handle fullscreen errors (e.g., user denied permission)
        if (import.meta.env.DEV) {
          console.log('Fullscreen orientation change error:', err)
        }
      }
    }

    // Listen for orientation changes
    window.screen.orientation?.addEventListener('change', handleOrientationChange)

    return () => {
      window.screen.orientation?.removeEventListener('change', handleOrientationChange)
    }
  }, [isMobile, isHls, hlsEl])

  // Show loading state if video URLs are still loading
  if (isLoadingVideoUrls || !videoUrl) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-32 w-32 animate-spin" />
      </div>
    )
  }

  return (
    <media-controller className={className}>
      {isHls ? (
        <hls-video
          src={videoUrl}
          slot="media"
          className={cinemaMode || isMobile ? 'cinema' : 'normal'}
          autoPlay={!contentWarning}
          loop={loop}
          poster={posterUrl}
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          ref={hlsRef}
          tabIndex={0}
          onError={handleVideoError}
        >
          {/* Captions for HLS */}
          {textTracks.map(vtt => (
            <CaptionTrack key={vtt.lang} track={vtt} sha256={sha256} />
          ))}
        </hls-video>
      ) : (
        <video
          crossOrigin="anonymous"
          src={videoUrl}
          ref={videoRef}
          className={cinemaMode || isMobile ? 'cinema' : 'normal'}
          slot="media"
          autoPlay={!contentWarning}
          loop={loop}
          poster={posterUrl}
          onTimeUpdate={handleTimeUpdate}
          tabIndex={0}
          onError={handleVideoError}
        >
          {/* Captions for regular video */}
          {textTracks.map(vtt => (
            <CaptionTrack key={vtt.lang} track={vtt} sha256={sha256} />
          ))}
        </video>
      )}

      {/* Loading spinner overlay */}
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
          <Loader2 className="h-32 w-32 animate-spin text-white text-8xl" />
        </div>
      )}

      {/* Play/Pause icon overlay */}
      {showPlayPauseIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div
            className={`bg-black/50 rounded-full p-4 ${
              isFadingOut ? 'animate-fade-out' : 'animate-reveal'
            }`}
          >
            {isPaused ? (
              // Pause icon (two rectangles)
              <svg className="w-20 h-20 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              // Play icon (triangle pointing right)
              <svg className="w-20 h-20 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {hasCaptions && <media-captions-menu hidden anchor="auto"></media-captions-menu>}

      <media-control-bar>
        <media-play-button />
        <media-mute-button />
        <media-volume-range />
        <media-time-display />
        <media-time-range />
        <media-playback-rate-button></media-playback-rate-button>
        <media-pip-button />
        {hasCaptions && <media-captions-menu-button></media-captions-menu-button>}
        {onToggleCinemaMode && (
          <button
            className="media-button"
            aria-label={cinemaMode ? 'Exit cinema mode' : 'Enter cinema mode'}
            onClick={onToggleCinemaMode}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {cinemaMode ? (
                // Exit cinema mode - smaller 16:9 rectangle (normal view)
                <rect x="1" y="4.5" width="22" height="15" rx="1" />
              ) : (
                // Enter cinema mode - full-width 16:9 rectangle (cinema view)
                <rect x="1" y="6" width="22" height="12" rx="1" />
              )}
            </svg>
          </button>
        )}
        <media-fullscreen-button />
      </media-control-bar>
    </media-controller>
  )
})

/**
 * Caption Track component with automatic failover using useMediaUrls
 */
function CaptionTrack({ track, sha256 }: { track: TextTrack; sha256?: string }) {
  // Use media URL failover for VTT captions
  const { currentUrl, moveToNext, hasMore } = useMediaUrls({
    urls: [track.url],
    mediaType: 'vtt',
    sha256, // Use video's sha256 to discover caption alternatives
  })

  const handleTrackError = useCallback(() => {
    if (hasMore) {
      if (import.meta.env.DEV) {
        console.log(`VTT track error for ${track.lang}, trying next URL...`)
      }
      moveToNext()
    } else {
      console.warn(`All VTT track URLs failed for ${track.lang}`)
    }
  }, [hasMore, moveToNext, track.lang])

  if (!currentUrl) {
    return null
  }

  return (
    <track
      label={getLanguageLabel(track.lang)}
      kind="captions"
      srcLang={track.lang}
      src={currentUrl}
      onError={handleTrackError}
    />
  )
}

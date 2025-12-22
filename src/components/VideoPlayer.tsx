import * as React from 'react'
import { useRef, useEffect, useCallback, useState, lazy, Suspense } from 'react'
import 'media-chrome'
import { type TextTrack } from '@/utils/video-event'
import { imageProxyVideoPreview } from '@/lib/utils'
import 'media-chrome/menu'
import '@/types/media-chrome.d.ts'
import { Loader2 } from 'lucide-react'
import { useMediaUrls } from '@/hooks/useMediaUrls'
import { useIsMobile } from '../hooks'
import { NativeVideoPlayer } from './video/NativeVideoPlayer'
import { PlayPauseOverlay } from './PlayPauseOverlay'

// Lazy load HLS video player only when needed
const HLSVideoPlayer = lazy(() =>
  import('./video/HLSVideoPlayer').then(module => ({ default: module.HLSVideoPlayer }))
)

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
  const hlsElRef = useRef<HTMLVideoElement | null>(null)
  const [hlsElementVersion, setHlsElementVersion] = useState(0)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimeoutRef = useRef<number | null>(null)
  const isMobile = useIsMobile()

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
  }, [urls])

  // Notify parent when element is ready (only once per element)
  useEffect(() => {
    const el = isHls ? hlsElRef.current : videoRef.current

    // Only notify if element changed and we haven't notified for this element yet
    if (el && el !== lastNotifiedElementRef.current && onVideoElementReadyRef.current) {
      lastNotifiedElementRef.current = el
      // Use requestAnimationFrame to defer the callback to avoid triggering during render
      requestAnimationFrame(() => {
        // Double-check the element is still the same before calling
        const currentEl = isHls ? hlsElRef.current : videoRef.current
        if (
          currentEl === el &&
          lastNotifiedElementRef.current === el &&
          onVideoElementReadyRef.current
        ) {
          onVideoElementReadyRef.current(el)
        }
      })
    }
  }, [isHls, hlsElementVersion])

  // Track if we've already set the initial position
  const hasSetInitialPos = useRef(false)

  // Set initial play position on mount
  useEffect(() => {
    const el = isHls ? hlsElRef.current : videoRef.current
    if (!el || hasSetInitialPos.current) return
    if (initialPlayPos > 0) {
      // Only seek if the difference is significant (e.g., >1s)
      if (Math.abs(el.currentTime - initialPlayPos) > 1) {
        el.currentTime = initialPlayPos
        hasSetInitialPos.current = true
      }
    }
  }, [initialPlayPos, isHls, hlsElementVersion])

  // Reset the flag when URLs change (new video)
  useEffect(() => {
    hasSetInitialPos.current = false
  }, [urls])

  // Detect video dimensions when metadata is loaded
  useEffect(() => {
    const el = isHls ? hlsElRef.current : videoRef.current
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
  }, [isHls, hlsElementVersion, onVideoDimensionsLoaded])

  // Handle video loading state and spinner display
  useEffect(() => {
    const el = isHls ? hlsElRef.current : videoRef.current
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
  }, [isHls, hlsElementVersion])

  // Ref callback for hls-video custom element
  const hlsRef = useCallback((node: Element | null) => {
    const newEl = node && 'currentTime' in node ? (node as HTMLVideoElement) : null
    // Only update state if the element actually changed
    if (newEl !== hlsElRef.current) {
      hlsElRef.current = newEl
      setHlsElementVersion(prev => prev + 1)
    }
  }, [])

  // Throttle time updates to reduce re-renders (from ~4Hz to ~1Hz)
  const lastTimeUpdateRef = useRef<number>(0)
  const handleTimeUpdate = useCallback(() => {
    const el = isHls ? hlsElRef.current : videoRef.current
    if (onTimeUpdate && el) {
      const now = Date.now()
      // Only update once per second (1000ms) instead of every 250ms
      if (now - lastTimeUpdateRef.current >= 1000) {
        lastTimeUpdateRef.current = now
        onTimeUpdate(el.currentTime)
      }
    }
  }, [onTimeUpdate, isHls])

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
    const el = isHls ? hlsElRef.current : videoRef.current
    if (!el) return
    el.addEventListener('ended', handleEndedEvent)
    return () => {
      el.removeEventListener('ended', handleEndedEvent)
    }
  }, [onEnded, isHls, hlsElementVersion, handleEndedEvent])

  // Handle automatic fullscreen on orientation change for mobile devices
  useEffect(() => {
    if (!isMobile) return

    const el = isHls ? hlsElRef.current : videoRef.current
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
  }, [isMobile, isHls, hlsElementVersion])

  // Show loading state if video URLs are still loading
  if (isLoadingVideoUrls || !videoUrl) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-32 w-32 animate-spin" />
      </div>
    )
  }

  return (
    <media-controller className={className} {...{ nohotkeys: true }}>
      {isHls ? (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-32 w-32 animate-spin" />
            </div>
          }
        >
          <HLSVideoPlayer
            videoUrl={videoUrl}
            posterUrl={posterUrl}
            loop={loop}
            contentWarning={contentWarning}
            cinemaMode={cinemaMode}
            isMobile={isMobile}
            textTracks={textTracks}
            sha256={sha256}
            onTimeUpdate={handleTimeUpdate}
            onVideoError={handleVideoError}
            hlsRef={hlsRef}
          />
        </Suspense>
      ) : (
        <NativeVideoPlayer
          videoUrl={videoUrl}
          posterUrl={posterUrl}
          loop={loop}
          contentWarning={contentWarning}
          cinemaMode={cinemaMode}
          isMobile={isMobile}
          textTracks={textTracks}
          sha256={sha256}
          videoRef={videoRef}
          onTimeUpdate={handleTimeUpdate}
          onVideoError={handleVideoError}
        />
      )}

      {/* Loading spinner overlay */}
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
          <Loader2 className="h-32 w-32 animate-spin text-white text-8xl" />
        </div>
      )}

      {/* Play/Pause icon overlay */}
      <PlayPauseOverlay videoRef={isHls ? hlsElRef : videoRef} />

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

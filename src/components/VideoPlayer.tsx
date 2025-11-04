import * as React from 'react'
import { useRef, useEffect, useCallback, useState } from 'react'
import 'media-chrome'
import 'hls-video-element'
import { TextTrack } from '@/utils/video-event'
import { getLanguageLabel, imageProxyVideoPreview } from '@/lib/utils'
import 'media-chrome/menu'
import '@/types/media-chrome.d.ts'
import { Loader2 } from 'lucide-react'
import { useMediaUrls } from '@/hooks/useMediaUrls'

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

export function VideoPlayer({
  urls,
  mime,
  poster,
  textTracks,
  loop = false,
  onTimeUpdate,
  className,
  contentWarning,
  sha256,
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
    onError: error => {
      console.error('Video URL failover error:', error)
      // Notify parent if all sources failed
      if (!hasMoreVideoUrls) {
        onAllSourcesFailed?.(urls)
      }
    },
  })

  const isHls = React.useMemo(
    () => mime === 'application/vnd.apple.mpegurl' || videoUrl?.endsWith('.m3u8'),
    [mime, videoUrl]
  )

  // Notify parent when video element is ready
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (onVideoElementReady) {
      onVideoElementReady(el)
    }
  }, [isHls, hlsEl, onVideoElementReady])

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
  const hlsRef = useCallback((node: Element | null) => {
    setHlsEl(node && 'currentTime' in node ? (node as HTMLVideoElement) : null)
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (onTimeUpdate && el) {
      onTimeUpdate(el.currentTime)
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
          className={cinemaMode ? 'cinema' : 'normal'}
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
          className={cinemaMode ? 'cinema' : 'normal'}
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
                <rect x="1" y="6" width="22" height="12" rx="1" />
              ) : (
                // Enter cinema mode - full-width 16:9 rectangle (cinema view)
                <rect x="1" y="4.5" width="22" height="15" rx="1" />
              )}
            </svg>
          </button>
        )}
        <media-fullscreen-button />
      </media-control-bar>
    </media-controller>
  )
}

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

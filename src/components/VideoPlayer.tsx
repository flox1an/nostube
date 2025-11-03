import * as React from 'react'
import { useRef, useEffect, useCallback, useState } from 'react'
import 'media-chrome'
import 'hls-video-element'
import { TextTrack } from '@/utils/video-event'
import { getLanguageLabel, imageProxyVideoPreview } from '@/lib/utils'
import 'media-chrome/menu'
import '@/types/media-chrome.d.ts'
import { Loader2 } from 'lucide-react'

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
  initialPlayPos = 0,
  onAllSourcesFailed,
  cinemaMode = false,
  onToggleCinemaMode,
  onVideoDimensionsLoaded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hlsEl, setHlsEl] = useState<HTMLVideoElement | null>(null)
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0)
  const [allFailed, setAllFailed] = useState(false)
  const [triedHead, setTriedHead] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimeoutRef = useRef<number | null>(null)

  const isHls = React.useMemo(
    () => mime === 'application/vnd.apple.mpegurl' || urls[currentUrlIndex]?.endsWith('.m3u8'),
    [mime, urls, currentUrlIndex]
  )

  useEffect(() => {
    setAllFailed(false)
    setCurrentUrlIndex(0)
    setTriedHead(false)
  }, [urls])

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

  // Frame-by-frame navigation with . and , keys (global listener)
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    function handleKeyDown(e: KeyboardEvent) {
      if (!el) return

      // Don't capture keys if user is typing in an input field
      const activeElement = document.activeElement
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable)
      ) {
        return
      }

      // Only step if video is paused and present
      if (!el.paused) return
      // Assume 30fps for frame step
      const frameStep = 1 / 30
      if (e.key === '.') {
        el.currentTime = Math.min(el.duration, el.currentTime + frameStep)
        e.preventDefault()
      } else if (e.key === ',') {
        el.currentTime = Math.max(0, el.currentTime - frameStep)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
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

  // Handle error: on first error, do HEAD requests for all remaining URLs to find a working one
  const handleVideoError = useCallback(async () => {
    if (!triedHead && urls.length > 1 && currentUrlIndex < urls.length - 1) {
      setTriedHead(true)
      // Try HEAD requests for all remaining URLs in parallel
      const remaining = urls.slice(currentUrlIndex + 1)
      const checks = await Promise.all(
        remaining.map(async url => {
          try {
            const res = await fetch(url, { method: 'HEAD', mode: 'cors' })
            return res.ok
          } catch {
            return false
          }
        })
      )
      const foundIdx = checks.findIndex(ok => ok)
      if (foundIdx !== -1) {
        setCurrentUrlIndex(currentUrlIndex + 1 + foundIdx)
        setAllFailed(false)
        return
      } else {
        setAllFailed(true)
        // Notify parent that all sources failed
        if (onAllSourcesFailed) {
          onAllSourcesFailed(urls)
        }
        return
      }
    }
    if (currentUrlIndex < urls.length - 1) {
      setCurrentUrlIndex(i => i + 1)
    } else {
      setAllFailed(true)
      // Notify parent that all sources failed
      if (onAllSourcesFailed) {
        onAllSourcesFailed(urls)
      }
    }
  }, [currentUrlIndex, urls, triedHead, onAllSourcesFailed])

  // Reset triedHead if currentUrlIndex changes (new error sequence)
  useEffect(() => {
    setTriedHead(false)
  }, [currentUrlIndex])

  const hasCaptions = textTracks.length > 0

  const posterUrl = React.useMemo(
    () => (poster !== undefined ? imageProxyVideoPreview(poster) : undefined),
    [poster]
  )

  return (
    <media-controller className={className}>
      {allFailed ? (
        <div className="flex items-center justify-center h-64 text-red-600 font-semibold">
          Failed to load video from all sources.
        </div>
      ) : isHls ? (
        <hls-video
          src={urls[currentUrlIndex]}
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
        ></hls-video>
      ) : (
        <video
          crossOrigin="anonymous"
          src={urls[currentUrlIndex]}
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
          {/* TODO translate label */}
          {textTracks.map(vtt => (
            <track
              key={vtt.lang}
              label={getLanguageLabel(vtt.lang)}
              kind="captions"
              srcLang={vtt.lang}
              src={vtt.url}
            ></track>
          ))}
          {/* TODO: add captions <track kind="captions" /> */}
          {/* TODO: add fallback sources <source src={url} type={mime} /> */}
        </video>
      )}

      {/* Loading spinner overlay */}
      {showSpinner && !allFailed && (
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

import { useEffect, useRef, useState } from 'react'

interface PlayPauseOverlayProps {
  /**
   * Reference to the video element to track play/pause events
   */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /**
   * Optional class name for the overlay container
   */
  className?: string
}

/**
 * Animated play/pause overlay that appears when video playback state changes.
 * Shows a play or pause icon with fade-in/fade-out animation.
 */
export function PlayPauseOverlay({ videoRef, className = '' }: PlayPauseOverlayProps) {
  const [showPlayPauseIcon, setShowPlayPauseIcon] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const playPauseTimeoutRef = useRef<number | null>(null)
  const fadeOutTimeoutRef = useRef<number | null>(null)

  // Handle play/pause events to show animated icon overlay
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

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
      // Start fade-out after 700ms
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
      // Start fade-out after 700ms
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

    videoEl.addEventListener('play', handlePlay)
    videoEl.addEventListener('pause', handlePause)

    // Initialize paused state
    setIsPaused(videoEl.paused)

    return () => {
      videoEl.removeEventListener('play', handlePlay)
      videoEl.removeEventListener('pause', handlePause)
      if (playPauseTimeoutRef.current !== null) {
        clearTimeout(playPauseTimeoutRef.current)
      }
      if (fadeOutTimeoutRef.current !== null) {
        clearTimeout(fadeOutTimeoutRef.current)
      }
    }
  }, [videoRef])

  if (!showPlayPauseIcon) {
    return null
  }

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 ${className}`}
    >
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
  )
}

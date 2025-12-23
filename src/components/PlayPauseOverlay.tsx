import { useEffect, useRef, useState, useCallback } from 'react'

interface PlayPauseOverlayProps {
  /**
   * Reference to the video element to track play/pause events
   */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /**
   * Optional class name for the overlay container
   */
  className?: string
  /**
   * Ref to track if the play/pause action was user-initiated.
   * Set to true before user-triggered play/pause to show overlay.
   * Automatically reset to false after overlay is shown.
   */
  userInitiatedRef?: React.MutableRefObject<boolean>
}

// Display duration for play icon (2x longer than pause)
const PLAY_DISPLAY_DURATION = 800
// Display duration for pause icon
const PAUSE_DISPLAY_DURATION = 400
// Time to wait after starting fade-out before unmounting (CSS animation is 100ms)
const FADE_OUT_BUFFER = 250

/**
 * Animated play/pause overlay that appears when video playback state changes.
 * Shows a play or pause icon with fade-in/fade-out animation.
 * Play icon displays 2x longer than pause icon.
 */
export function PlayPauseOverlay({
  videoRef,
  className = '',
  userInitiatedRef,
}: PlayPauseOverlayProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const displayTimeoutRef = useRef<number | null>(null)
  const fadeOutTimeoutRef = useRef<number | null>(null)

  // Clear any pending timeouts
  const clearTimeouts = useCallback(() => {
    if (displayTimeoutRef.current !== null) {
      clearTimeout(displayTimeoutRef.current)
      displayTimeoutRef.current = null
    }
    if (fadeOutTimeoutRef.current !== null) {
      clearTimeout(fadeOutTimeoutRef.current)
      fadeOutTimeoutRef.current = null
    }
  }, [])

  // Handle play/pause events to show animated icon overlay
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    const showOverlay = (paused: boolean) => {
      // Only show overlay if this was a user-initiated action
      if (userInitiatedRef && !userInitiatedRef.current) {
        return
      }

      // Reset the flag after checking
      if (userInitiatedRef) {
        userInitiatedRef.current = false
      }

      setIsPaused(paused)
      setIsFadingOut(false)
      setIsVisible(true)
      clearTimeouts()

      // Play icon shows 2x longer than pause icon
      const displayDuration = paused ? PAUSE_DISPLAY_DURATION : PLAY_DISPLAY_DURATION

      // Start fade-out after display duration
      displayTimeoutRef.current = window.setTimeout(() => {
        setIsFadingOut(true)
        displayTimeoutRef.current = null

        // Unmount after fade-out animation completes
        fadeOutTimeoutRef.current = window.setTimeout(() => {
          setIsVisible(false)
          setIsFadingOut(false)
          fadeOutTimeoutRef.current = null
        }, FADE_OUT_BUFFER)
      }, displayDuration)
    }

    const handlePlay = () => showOverlay(false)
    const handlePause = () => showOverlay(true)

    videoEl.addEventListener('play', handlePlay)
    videoEl.addEventListener('pause', handlePause)

    // Initialize paused state
    setIsPaused(videoEl.paused)

    return () => {
      videoEl.removeEventListener('play', handlePlay)
      videoEl.removeEventListener('pause', handlePause)
      clearTimeouts()
    }
  }, [videoRef, userInitiatedRef, clearTimeouts])

  // Don't render anything if not visible
  if (!isVisible) {
    return null
  }

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 ${className}`}
    >
      <div
        className={`bg-black/50 rounded-full p-3 ${
          isFadingOut ? 'animate-fade-out' : 'animate-reveal'
        }`}
        style={{ animationFillMode: 'forwards' }}
      >
        {isPaused ? (
          // Pause icon (two rectangles)
          <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          // Play icon (triangle pointing right)
          <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </div>
    </div>
  )
}

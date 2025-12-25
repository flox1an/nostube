import { useState, useEffect, useCallback, useRef } from 'react'

interface UseControlsVisibilityProps {
  isPlaying: boolean
  isSeeking?: boolean
  hideDelay?: number
}

interface UseControlsVisibilityResult {
  isVisible: boolean
  showControls: () => void
}

/**
 * Hook to manage auto-hiding of video controls
 * Simplified: single boolean state instead of timestamp comparison
 */
export function useControlsVisibility({
  isPlaying,
  isSeeking = false,
  hideDelay = 3000,
}: UseControlsVisibilityProps): UseControlsVisibilityResult {
  const [isInteracting, setIsInteracting] = useState(true)
  const timeoutRef = useRef<number | null>(null)

  // Controls are visible when paused, seeking, OR when user recently interacted
  const isVisible = !isPlaying || isSeeking || isInteracting

  // Clear any pending timeout
  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Schedule hiding controls
  const scheduleHide = useCallback(() => {
    clearHideTimeout()
    if (isPlaying) {
      timeoutRef.current = window.setTimeout(() => {
        setIsInteracting(false)
      }, hideDelay)
    }
  }, [isPlaying, hideDelay, clearHideTimeout])

  // Show controls and schedule hide
  const showControls = useCallback(() => {
    setIsInteracting(true)
    scheduleHide()
  }, [scheduleHide])

  // When isPlaying changes, update visibility
  useEffect(() => {
    if (isPlaying) {
      // When playback starts, show controls briefly then hide
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => setIsInteracting(true), 0)
      scheduleHide()
    } else {
      // When paused, keep controls visible
      clearHideTimeout()
      setTimeout(() => setIsInteracting(true), 0)
    }

    return clearHideTimeout
  }, [isPlaying, scheduleHide, clearHideTimeout])

  // When seeking state changes, manage visibility
  useEffect(() => {
    if (isSeeking) {
      // While seeking, keep controls visible and clear any hide timeout
      clearHideTimeout()
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => setIsInteracting(true), 0)
    } else if (isPlaying) {
      // When done seeking and playing, schedule hide
      scheduleHide()
    }
  }, [isSeeking, isPlaying, clearHideTimeout, scheduleHide])

  return {
    isVisible,
    showControls,
  }
}

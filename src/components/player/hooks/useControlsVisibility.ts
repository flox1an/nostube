import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

interface UseControlsVisibilityProps {
  isPlaying: boolean
  hideDelay?: number
}

interface UseControlsVisibilityResult {
  isVisible: boolean
  showControls: () => void
}

/**
 * Hook to manage auto-hiding of video controls
 */
export function useControlsVisibility({
  isPlaying,
  hideDelay = 3000,
}: UseControlsVisibilityProps): UseControlsVisibilityResult {
  // Track when controls were last shown (by user interaction)
  const [lastInteractionTime, setLastInteractionTime] = useState(() => Date.now())
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const timeoutRef = useRef<number | null>(null)

  // Compute visibility: visible if paused, or if recent interaction
  const isVisible = useMemo(() => {
    if (!isPlaying) return true
    return currentTime - lastInteractionTime < hideDelay
  }, [isPlaying, currentTime, lastInteractionTime, hideDelay])

  // Clear any pending timeout
  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Show controls and schedule hide
  const showControls = useCallback(() => {
    const now = Date.now()
    setLastInteractionTime(now)
    setCurrentTime(now)

    clearHideTimeout()
    if (isPlaying) {
      timeoutRef.current = window.setTimeout(() => {
        setCurrentTime(Date.now())
      }, hideDelay)
    }
  }, [isPlaying, hideDelay, clearHideTimeout])

  // When isPlaying changes, update timeouts
  useEffect(() => {
    clearHideTimeout()

    if (isPlaying) {
      // Schedule hide after delay
      timeoutRef.current = window.setTimeout(() => {
        setCurrentTime(Date.now())
      }, hideDelay)
    }

    return () => {
      clearHideTimeout()
    }
  }, [isPlaying, hideDelay, clearHideTimeout])

  return {
    isVisible,
    showControls,
  }
}

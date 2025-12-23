import { useState, useCallback, useRef, useEffect } from 'react'

interface UseSeekAccumulatorProps {
  onSeek: (deltaSeconds: number) => void
  stepSize?: number
  debounceMs?: number
}

interface UseSeekAccumulatorResult {
  /** Add to the accumulated seek time (positive = forward, negative = backward) */
  addSeek: (direction: 'forward' | 'backward') => void
  /** Current accumulated seek time (for display) */
  accumulatedTime: number
  /** Whether we're currently accumulating (for showing indicator) */
  isAccumulating: boolean
  /** Direction of current accumulation */
  direction: 'forward' | 'backward' | null
}

/**
 * Hook for accumulating seek operations with debounced execution
 *
 * Multiple quick seeks (within debounceMs) accumulate and show "+10", "+15", etc.
 * The actual seek happens after debounceMs of no activity.
 */
export function useSeekAccumulator({
  onSeek,
  stepSize = 5,
  debounceMs = 1000,
}: UseSeekAccumulatorProps): UseSeekAccumulatorResult {
  const [accumulatedTime, setAccumulatedTime] = useState(0)
  const [isAccumulating, setIsAccumulating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'backward' | null>(null)

  const debounceTimeoutRef = useRef<number | null>(null)
  const accumulatedRef = useRef(0)

  // Clear the debounce timeout
  const clearDebounce = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      clearTimeout(debounceTimeoutRef.current)
      debounceTimeoutRef.current = null
    }
  }, [])

  // Execute the accumulated seek
  const executeSeek = useCallback(() => {
    if (accumulatedRef.current !== 0) {
      onSeek(accumulatedRef.current)
    }
    accumulatedRef.current = 0
    setAccumulatedTime(0)
    setIsAccumulating(false)
    setDirection(null)
  }, [onSeek])

  // Add to accumulated seek time
  // Below 5s: add 1s increments. At 5s or above: add stepSize (5s) increments
  const addSeek = useCallback(
    (dir: 'forward' | 'backward') => {
      const currentAbs = Math.abs(accumulatedRef.current)
      const increment = currentAbs < 5 ? 1 : stepSize
      const delta = dir === 'forward' ? increment : -increment
      accumulatedRef.current += delta

      setAccumulatedTime(accumulatedRef.current)
      setIsAccumulating(true)
      setDirection(accumulatedRef.current >= 0 ? 'forward' : 'backward')

      // Clear existing timeout and set new one
      clearDebounce()
      debounceTimeoutRef.current = window.setTimeout(executeSeek, debounceMs)
    },
    [stepSize, debounceMs, clearDebounce, executeSeek]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearDebounce()
    }
  }, [clearDebounce])

  return {
    addSeek,
    accumulatedTime,
    isAccumulating,
    direction,
  }
}

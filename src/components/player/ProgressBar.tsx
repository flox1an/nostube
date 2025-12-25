import { useRef, useState, useCallback, useEffect, memo } from 'react'
import { formatTime } from './TimeDisplay'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ProgressBarProps {
  currentTime: number
  duration: number
  bufferedPercentage: number
  onSeek: (time: number) => void
}

/**
 * Progress bar with hover preview, scrubber, and buffering indicator
 * Supports both mouse (desktop) and touch (mobile) interactions
 */
export const ProgressBar = memo(function ProgressBar({
  currentTime,
  duration,
  bufferedPercentage,
  onSeek,
}: ProgressBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isTouchDragging, setIsTouchDragging] = useState(false)
  const [hoverPosition, setHoverPosition] = useState(0)
  const [hoverTime, setHoverTime] = useState(0)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const isMobile = useIsMobile()

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0
  // Show preview position while touch dragging, otherwise show current position
  const displayPercentage =
    isTouchDragging && previewTime !== null ? (previewTime / duration) * 100 : progressPercentage

  const getTimeFromPosition = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container || duration <= 0) return 0

      const rect = container.getBoundingClientRect()
      const position = (clientX - rect.left) / rect.width
      return Math.max(0, Math.min(duration, position * duration))
    },
    [duration]
  )

  const getPositionPercentage = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return 0

    const rect = container.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const time = getTimeFromPosition(e.clientX)
      const position = getPositionPercentage(e.clientX)
      setHoverTime(time)
      setHoverPosition(position)

      if (isDragging) {
        onSeek(time)
      }
    },
    [getTimeFromPosition, getPositionPercentage, isDragging, onSeek]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      const time = getTimeFromPosition(e.clientX)
      onSeek(time)
    },
    [getTimeFromPosition, onSeek]
  )

  // Touch event handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      const touch = e.touches[0]
      if (!touch) return

      setIsTouchDragging(true)
      const time = getTimeFromPosition(touch.clientX)
      const position = getPositionPercentage(touch.clientX)
      setPreviewTime(time)
      setHoverTime(time)
      setHoverPosition(position)
    },
    [getTimeFromPosition, getPositionPercentage]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isTouchDragging) return
      e.stopPropagation()

      const touch = e.touches[0]
      if (!touch) return

      const time = getTimeFromPosition(touch.clientX)
      const position = getPositionPercentage(touch.clientX)
      setPreviewTime(time)
      setHoverTime(time)
      setHoverPosition(position)
    },
    [isTouchDragging, getTimeFromPosition, getPositionPercentage]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()

      if (isTouchDragging && previewTime !== null) {
        // Only seek when touch ends (debounced behavior)
        onSeek(previewTime)
      }

      setIsTouchDragging(false)
      setPreviewTime(null)
    },
    [isTouchDragging, previewTime, onSeek]
  )

  // Handle mouse events outside the component while dragging
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMouseMove(e)
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, handleMouseMove])

  const showScrubber = isHovering || isDragging || isTouchDragging

  // Scrubber sizes: larger on mobile for easier touch, larger when active
  const getScrubberSize = () => {
    if (showScrubber) {
      return isMobile ? 'w-7 h-7' : 'w-5 h-5'
    }
    return isMobile ? 'w-5 h-5' : 'w-3 h-3'
  }

  return (
    <div
      ref={containerRef}
      className={`group relative w-full cursor-pointer ${isMobile ? 'py-4' : 'py-2'}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Hover/drag timestamp tooltip */}
      {showScrubber && (
        <div
          className="absolute bottom-full mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded pointer-events-none z-20"
          style={{
            left: `${isTouchDragging ? hoverPosition : hoverPosition}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Track wrapper - centers the track vertically so it expands both ways */}
      <div className="flex items-center h-1">
        <div
          className={`relative w-full rounded-full transition-all ${showScrubber ? 'h-1.5' : 'h-1'}`}
        >
          {/* Background track */}
          <div className="absolute inset-0 bg-white/20 rounded-full" />

          {/* Buffered track */}
          <div
            className="absolute inset-y-0 left-0 bg-white/40 rounded-full"
            style={{ width: `${bufferedPercentage}%` }}
          />

          {/* Progress track (played) - shows preview position during touch drag */}
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full"
            style={{ width: `${displayPercentage}%` }}
          />

          {/* Hover preview track - shows position up to mouse/touch */}
          {showScrubber && (
            <div
              className="absolute inset-y-0 left-0 bg-white/30 rounded-full pointer-events-none"
              style={{ width: `${hoverPosition}%` }}
            />
          )}

          {/* Scrubber - always visible, grows on hover/touch, larger on mobile */}
          <div
            className={`absolute bg-primary rounded-full shadow-md transition-all ${getScrubberSize()}`}
            style={{
              left: `${displayPercentage}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      </div>
    </div>
  )
})

import { useRef, useState, useCallback, useEffect, memo } from 'react'
import { formatTime } from './TimeDisplay'
import { useIsMobile } from '@/hooks/useIsMobile'
import { TimelineMarkers } from './TimelineMarkers'

interface ProgressBarProps {
  currentTime: number
  duration: number
  bufferedPercentage: number
  onSeek: (time: number) => void
  onSeekingChange?: (isSeeking: boolean) => void
  showTimelineMarkers?: boolean
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
  onSeekingChange,
  showTimelineMarkers = true,
}: ProgressBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isTouchDragging, setIsTouchDragging] = useState(false)
  const [hoverPosition, setHoverPosition] = useState(0)
  const [hoverTime, setHoverTime] = useState(0)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  // Use ref to track preview time for touchend handler (avoids stale closure issue)
  const previewTimeRef = useRef<number | null>(null)
  const isMobile = useIsMobile()

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0
  // Show preview position while touch dragging or waiting for seek to complete
  const displayPercentage =
    previewTime !== null ? (previewTime / duration) * 100 : progressPercentage

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
        // Update preview immediately so scrubber follows mouse without waiting for video to seek
        setPreviewTime(time)
        previewTimeRef.current = time
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
      // Set preview immediately for responsive scrubber
      setPreviewTime(time)
      previewTimeRef.current = time
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
      previewTimeRef.current = time
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
      previewTimeRef.current = time
      setHoverTime(time)
      setHoverPosition(position)
    },
    [isTouchDragging, getTimeFromPosition, getPositionPercentage]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      e.preventDefault()

      // Use ref to get latest preview time (avoids stale closure)
      if (previewTimeRef.current !== null) {
        onSeek(previewTimeRef.current)
      }

      // Keep previewTime displayed until currentTime catches up (cleared in effect below)
      setIsTouchDragging(false)
    },
    [onSeek]
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

  // Combined seeking state for mouse and touch
  const isSeeking = isDragging || isTouchDragging

  // Clear preview time when currentTime catches up after a seek
  useEffect(() => {
    if (previewTime !== null && !isSeeking) {
      // Check if currentTime is close enough to previewTime (within 0.5s)
      if (Math.abs(currentTime - previewTime) < 0.5) {
        // Use setTimeout to avoid synchronous setState in effect
        setTimeout(() => {
          setPreviewTime(null)
          previewTimeRef.current = null
        }, 0)
      }
    }
  }, [currentTime, previewTime, isSeeking])

  // Notify parent when seeking state changes
  useEffect(() => {
    onSeekingChange?.(isSeeking)
  }, [isSeeking, onSeekingChange])

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
      style={{ touchAction: 'none' }} // Prevent browser touch delays for immediate response
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
          className="absolute bottom-full mb-2 px-2 py-1 bg-black/40 text-white text-xs rounded pointer-events-none z-20"
          style={{
            left: `${hoverPosition}%`,
            transform: 'translateX(-50%)',
            willChange: isSeeking ? 'left' : 'auto',
          }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Timeline markers (SoundCloud-style) - positioned above the track, outside height-changing element */}
      {showTimelineMarkers && duration > 0 && (
        <div className="absolute inset-x-0 bottom-1/2 pointer-events-none" style={{ zIndex: 15 }}>
          <TimelineMarkers duration={duration} currentTime={currentTime} onSeekToMarker={onSeek} />
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

          {/* Progress track (played) - shows preview position during drag */}
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full"
            style={{
              width: `${displayPercentage}%`,
              willChange: isSeeking ? 'width' : 'auto',
            }}
          />

          {/* Hover preview track - shows position up to mouse/touch */}
          {showScrubber && (
            <div
              className="absolute inset-y-0 left-0 bg-white/30 rounded-full pointer-events-none"
              style={{
                width: `${hoverPosition}%`,
                willChange: isSeeking ? 'width' : 'auto',
              }}
            />
          )}

          {/* Scrubber - always visible, grows on hover/touch, larger on mobile */}
          {/* Disable transitions during drag for immediate response */}
          <div
            className={`absolute bg-primary rounded-full shadow-md ${isSeeking ? '' : 'transition-all'} ${getScrubberSize()}`}
            style={{
              left: `${displayPercentage}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              willChange: isSeeking ? 'left' : 'auto',
            }}
          />
        </div>
      </div>
    </div>
  )
})

import { useRef, useState, useCallback, useEffect } from 'react'
import { formatTime } from './TimeDisplay'

interface ProgressBarProps {
  currentTime: number
  duration: number
  bufferedPercentage: number
  onSeek: (time: number) => void
}

/**
 * Progress bar with hover preview, scrubber, and buffering indicator
 */
export function ProgressBar({
  currentTime,
  duration,
  bufferedPercentage,
  onSeek,
}: ProgressBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverPosition, setHoverPosition] = useState(0)
  const [hoverTime, setHoverTime] = useState(0)

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

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

  const showScrubber = isHovering || isDragging

  return (
    <div
      ref={containerRef}
      className="group relative w-full cursor-pointer py-3"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
    >
      {/* Hover timestamp tooltip */}
      {showScrubber && (
        <div
          className="absolute bottom-full mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded pointer-events-none z-20"
          style={{ left: `${hoverPosition}%`, transform: 'translateX(-50%)' }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Track container - needs relative positioning for absolute children */}
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

        {/* Progress track (played) */}
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full"
          style={{ width: `${progressPercentage}%` }}
        />

        {/* Scrubber - positioned relative to track */}
        <div
          className={`absolute w-3.5 h-3.5 bg-primary rounded-full shadow-md transition-opacity ${
            showScrubber ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            left: `${progressPercentage}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    </div>
  )
}

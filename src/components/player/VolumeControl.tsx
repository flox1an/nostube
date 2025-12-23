import { useRef, useState, useCallback, useEffect } from 'react'
import { Volume2, Volume1, VolumeX } from 'lucide-react'

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

/**
 * Volume control with icon and expandable slider
 */
export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const hideTimeoutRef = useRef<number | null>(null)

  // Show actual volume (not affected by mute for visual feedback)
  const displayVolume = volume

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const startHideTimeout = useCallback(() => {
    clearHideTimeout()
    hideTimeoutRef.current = window.setTimeout(() => {
      if (!isDragging) {
        setIsExpanded(false)
      }
    }, 300)
  }, [clearHideTimeout, isDragging])

  const handleMouseEnter = useCallback(() => {
    clearHideTimeout()
    setIsExpanded(true)
  }, [clearHideTimeout])

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      startHideTimeout()
    }
  }, [startHideTimeout, isDragging])

  const getVolumeFromPosition = useCallback((clientX: number) => {
    const slider = sliderRef.current
    if (!slider) return 0.5

    const rect = slider.getBoundingClientRect()
    const position = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(1, position))
  }, [])

  const handleSliderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      const newVolume = getVolumeFromPosition(e.clientX)
      onVolumeChange(newVolume)
    },
    [getVolumeFromPosition, onVolumeChange]
  )

  // Handle mouse events outside the component while dragging
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const newVolume = getVolumeFromPosition(e.clientX)
      onVolumeChange(newVolume)
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
  }, [isDragging, getVolumeFromPosition, onVolumeChange])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearHideTimeout()
    }
  }, [clearHideTimeout])

  // Choose icon based on volume level and mute state
  const effectiveVolume = isMuted ? 0 : volume
  const VolumeIcon =
    isMuted || effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2

  return (
    <div
      ref={containerRef}
      className="flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Volume icon button */}
      <button
        type="button"
        onClick={onToggleMute}
        className="flex items-center justify-center w-10 h-10 text-white hover:text-white/80 transition-colors"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        <VolumeIcon className="w-6 h-6" />
      </button>

      {/* Expandable slider */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isExpanded || isDragging ? 'w-20' : 'w-0'
        }`}
      >
        <div
          ref={sliderRef}
          className="relative h-4 mx-2 cursor-pointer flex items-center"
          onMouseDown={handleSliderMouseDown}
        >
          {/* Track background */}
          <div className="absolute left-0 right-0 h-1 bg-white/30 rounded-full" />

          {/* Volume fill */}
          <div
            className="absolute left-0 h-1 bg-white rounded-full"
            style={{ width: `${displayVolume * 100}%` }}
          />

          {/* Scrubber */}
          <div
            className="absolute w-3 h-3 bg-white rounded-full shadow-sm"
            style={{
              left: `${displayVolume * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

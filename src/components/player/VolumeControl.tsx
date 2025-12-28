import { useRef, useState, useCallback, useEffect, memo } from 'react'
import { Volume2, Volume1, VolumeX } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface VolumeControlProps {
  volume: number
  isMuted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

/**
 * Volume control with icon and expandable slider
 */
export const VolumeControl = memo(function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
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
    if (!isDragging && !hasFocus) {
      startHideTimeout()
    }
  }, [startHideTimeout, isDragging, hasFocus])

  // Handle focus events for keyboard accessibility
  const handleFocusCapture = useCallback(() => {
    clearHideTimeout()
    setHasFocus(true)
    setIsExpanded(true)
  }, [clearHideTimeout])

  const handleBlurCapture = useCallback(
    (e: React.FocusEvent) => {
      // Check if focus is moving to another element within the container
      const container = containerRef.current
      if (container && e.relatedTarget instanceof Node && container.contains(e.relatedTarget)) {
        return // Focus is still within container
      }
      setHasFocus(false)
      if (!isDragging) {
        startHideTimeout()
      }
    },
    [isDragging, startHideTimeout]
  )

  // Handle keyboard controls for volume slider
  const handleSliderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.05
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          onVolumeChange(Math.min(1, volume + step))
          break
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          onVolumeChange(Math.max(0, volume - step))
          break
        case 'Home':
          e.preventDefault()
          e.stopPropagation()
          onVolumeChange(0)
          break
        case 'End':
          e.preventDefault()
          e.stopPropagation()
          onVolumeChange(1)
          break
      }
    },
    [volume, onVolumeChange]
  )

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
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {/* Volume icon button */}
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleMute}
            className="flex items-center justify-center w-10 h-10 text-white rounded-full cursor-pointer transition-all hover:bg-black/40"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <VolumeIcon className="w-6 h-6" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{isMuted ? 'Unmute (M)' : 'Mute (M)'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Expandable slider */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isExpanded || isDragging || hasFocus ? 'w-20' : 'w-0'
        }`}
      >
        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayVolume * 100)}
          aria-valuetext={`${Math.round(displayVolume * 100)}%`}
          className="relative h-4 mx-2 cursor-pointer flex items-center outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1 rounded"
          onMouseDown={handleSliderMouseDown}
          onKeyDown={handleSliderKeyDown}
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
})

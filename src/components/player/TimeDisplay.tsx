import { useState, memo } from 'react'

interface TimeDisplayProps {
  currentTime: number
  duration: number
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Time display showing current time / duration
 * Click to toggle between elapsed and remaining time
 */
export const TimeDisplay = memo(function TimeDisplay({ currentTime, duration }: TimeDisplayProps) {
  const [showRemaining, setShowRemaining] = useState(false)

  const toggleMode = () => setShowRemaining(prev => !prev)

  const remainingTime = duration - currentTime
  const displayTime = showRemaining ? remainingTime : currentTime
  const prefix = showRemaining ? '-' : ''

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="flex items-center text-white text-sm font-medium tabular-nums whitespace-nowrap p-2 rounded-full cursor-pointer transition-all hover:bg-black/40"
      title={showRemaining ? 'Click to show elapsed time' : 'Click to show remaining time'}
    >
      <span>
        {prefix}
        {formatTime(displayTime)}
      </span>
      <span className="mx-1 text-white/60">/</span>
      <span className="text-white/80">{formatTime(duration)}</span>
    </button>
  )
})

// Export formatTime for use in other components (e.g., progress bar tooltip)
export { formatTime }

import { useState, memo } from 'react'
import { formatTimestamp } from '@/lib/format-utils'

interface TimeDisplayProps {
  currentTime: number
  duration: number
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
        {formatTimestamp(displayTime)}
      </span>
      <span className="mx-1 text-white/60">/</span>
      <span className="text-white/80">{formatTimestamp(duration)}</span>
    </button>
  )
})

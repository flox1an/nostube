import { memo } from 'react'

interface SeekIndicatorProps {
  /** Accumulated seek time in seconds (positive = forward, negative = backward) */
  accumulatedTime: number
  /** Whether to show the indicator */
  isVisible: boolean
  /** Direction of seek */
  direction: 'forward' | 'backward' | null
}

/**
 * Overlay that shows accumulated seek time like "+10", "+15", "-5"
 * Positioned on the right when seeking forward, left when seeking backward
 */
export const SeekIndicator = memo(function SeekIndicator({
  accumulatedTime,
  isVisible,
  direction,
}: SeekIndicatorProps) {
  if (!isVisible || accumulatedTime === 0) return null

  const displayTime = Math.abs(accumulatedTime)
  const sign = accumulatedTime > 0 ? '+' : '-'
  const isForward = direction === 'forward'

  return (
    <div
      className={`absolute inset-y-0 pointer-events-none z-20 flex items-center ${
        isForward ? 'right-0 pr-4' : 'left-0 pl-4'
      }`}
      style={{ width: '25%' }}
    >
      <div
        className={`flex items-center gap-2 px-5 py-3 rounded-xl bg-black/50 backdrop-blur-sm animate-in fade-in ${
          isForward ? 'slide-in-from-right-4 ml-auto' : 'slide-in-from-left-4'
        } duration-150`}
      >
        {/* Arrows */}
        <div className="flex">
          {direction === 'backward' ? (
            <>
              <SeekArrow direction="left" />
              <SeekArrow direction="left" />
            </>
          ) : (
            <>
              <SeekArrow direction="right" />
              <SeekArrow direction="right" />
            </>
          )}
        </div>

        {/* Time display */}
        <span className="text-white text-2xl font-bold tabular-nums">
          {sign}
          {displayTime}s
        </span>
      </div>
    </div>
  )
})

function SeekArrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      className="w-6 h-6 text-white"
      fill="currentColor"
      viewBox="0 0 24 24"
      style={{ transform: direction === 'left' ? 'scaleX(-1)' : undefined }}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

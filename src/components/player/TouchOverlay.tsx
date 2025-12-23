import { useRef, useState, useCallback } from 'react'

interface TouchOverlayProps {
  onSeekBackward: () => void
  onSeekForward: () => void
  onTogglePlay: () => void
  onShowControls: () => void
  seekAmount?: number
}

interface RippleState {
  id: number
  side: 'left' | 'right'
  x: number
  y: number
}

/**
 * Touch overlay for mobile interactions
 * - Single tap: show/hide controls
 * - Double tap left/right: seek backward/forward with ripple animation
 */
export function TouchOverlay({
  onSeekBackward,
  onSeekForward,
  onTogglePlay,
  onShowControls,
  seekAmount = 10,
}: TouchOverlayProps) {
  const [ripples, setRipples] = useState<RippleState[]>([])
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const tapTimeoutRef = useRef<number | null>(null)
  const rippleIdRef = useRef(0)

  const clearTapTimeout = useCallback(() => {
    if (tapTimeoutRef.current !== null) {
      clearTimeout(tapTimeoutRef.current)
      tapTimeoutRef.current = null
    }
  }, [])

  const addRipple = useCallback((side: 'left' | 'right', x: number, y: number) => {
    const id = rippleIdRef.current++
    setRipples(prev => [...prev, { id, side, x, y }])

    // Remove ripple after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 600)
  }, [])

  const handleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const target = e.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()

      let clientX: number, clientY: number
      if ('touches' in e) {
        clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0
        clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0
      } else {
        clientX = e.clientX
        clientY = e.clientY
      }

      const x = clientX - rect.left
      const y = clientY - rect.top
      const now = Date.now()

      // Check for double tap
      if (
        lastTapRef.current &&
        now - lastTapRef.current.time < 300 &&
        Math.abs(x - lastTapRef.current.x) < 50 &&
        Math.abs(y - lastTapRef.current.y) < 50
      ) {
        // Double tap detected
        clearTapTimeout()
        lastTapRef.current = null

        const thirdWidth = rect.width / 3

        if (x < thirdWidth) {
          // Left third - seek backward
          onSeekBackward()
          addRipple('left', x, y)
        } else if (x > thirdWidth * 2) {
          // Right third - seek forward
          onSeekForward()
          addRipple('right', x, y)
        } else {
          // Center - toggle play/pause
          onTogglePlay()
        }
      } else {
        // First tap - wait for potential second tap
        lastTapRef.current = { time: now, x, y }

        tapTimeoutRef.current = window.setTimeout(() => {
          // Single tap - show controls
          onShowControls()
          lastTapRef.current = null
        }, 300)
      }
    },
    [onSeekBackward, onSeekForward, onTogglePlay, onShowControls, clearTapTimeout, addRipple]
  )

  return (
    <div className="absolute inset-0 z-10" onClick={handleTap} onTouchEnd={handleTap}>
      {/* Ripple animations */}
      {ripples.map(ripple => (
        <SeekRipple
          key={ripple.id}
          side={ripple.side}
          x={ripple.x}
          y={ripple.y}
          seekAmount={seekAmount}
        />
      ))}
    </div>
  )
}

interface SeekRippleProps {
  side: 'left' | 'right'
  x: number
  y: number
  seekAmount: number
}

function SeekRipple({ side, x, y, seekAmount }: SeekRippleProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: side === 'left' ? 0 : 'auto',
        right: side === 'right' ? 0 : 'auto',
        top: 0,
        bottom: 0,
        width: '33.333%',
      }}
    >
      {/* Ripple circle */}
      <div
        className="absolute w-24 h-24 rounded-full bg-white/20 animate-ping"
        style={{
          left: side === 'left' ? x : 'auto',
          right: side === 'right' ? `calc(100% - ${x}px)` : 'auto',
          top: y,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Seek indicator */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center text-white animate-fade-in">
          {/* Arrows */}
          <div className="flex">
            {side === 'left' ? (
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
          {/* Seconds text */}
          <span className="text-sm font-medium mt-1">{seekAmount} seconds</span>
        </div>
      </div>
    </div>
  )
}

function SeekArrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      className="w-6 h-6"
      fill="currentColor"
      viewBox="0 0 24 24"
      style={{ transform: direction === 'left' ? 'scaleX(-1)' : undefined }}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

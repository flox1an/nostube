import { useRef, useState, useCallback } from 'react'

interface TouchOverlayProps {
  onSeekBackward: () => void
  onSeekForward: () => void
  onTogglePlay: () => void
  onShowControls: () => void
}

interface RippleState {
  id: number
  side: 'left' | 'right'
  x: number
  y: number
}

/**
 * Touch overlay for mobile interactions
 * - Tap left third: seek backward (accumulates with fast taps)
 * - Tap right third: seek forward (accumulates with fast taps)
 * - Tap center: toggle play/pause
 */
export function TouchOverlay({
  onSeekBackward,
  onSeekForward,
  onTogglePlay,
  onShowControls,
}: TouchOverlayProps) {
  const [ripples, setRipples] = useState<RippleState[]>([])
  const rippleIdRef = useRef(0)

  const addRipple = useCallback((side: 'left' | 'right', x: number, y: number) => {
    const id = rippleIdRef.current++
    setRipples(prev => [...prev, { id, side, x, y }])

    // Remove ripple after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 400)
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
        // Center - toggle play/pause and show controls
        onTogglePlay()
        onShowControls()
      }
    },
    [onSeekBackward, onSeekForward, onTogglePlay, onShowControls, addRipple]
  )

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-12 z-10"
      onClick={handleTap}
      onTouchEnd={handleTap}
    >
      {/* Ripple animations */}
      {ripples.map(ripple => (
        <SeekRipple key={ripple.id} side={ripple.side} x={ripple.x} y={ripple.y} />
      ))}
    </div>
  )
}

interface SeekRippleProps {
  side: 'left' | 'right'
  x: number
  y: number
}

/**
 * Simple ripple effect for touch feedback
 * The accumulated time display is handled by SeekIndicator
 */
function SeekRipple({ side, x, y }: SeekRippleProps) {
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
        className="absolute w-20 h-20 rounded-full bg-white/30 animate-ping"
        style={{
          left: side === 'left' ? x : 'auto',
          right: side === 'right' ? `calc(100% - ${x}px)` : 'auto',
          top: y,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Direction arrows */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex text-white/80">
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

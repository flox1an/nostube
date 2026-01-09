import { useRef, useState, useCallback, memo } from 'react'

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

// Timing constants for double-tap detection
const DOUBLE_TAP_DELAY = 300 // ms window for double tap

/**
 * Touch overlay for mobile interactions
 * - Double-tap left quarter: seek backward (triple+ taps stack more time)
 * - Double-tap right quarter: seek forward (triple+ taps stack more time)
 * - Tap center half: toggle play/pause
 */
export const TouchOverlay = memo(function TouchOverlay({
  onSeekBackward,
  onSeekForward,
  onTogglePlay,
  onShowControls,
}: TouchOverlayProps) {
  const [ripples, setRipples] = useState<RippleState[]>([])
  const rippleIdRef = useRef(0)

  // Track taps for double-tap detection on seek zones
  const lastTapRef = useRef<{
    time: number
    zone: 'left' | 'right' | 'center'
    x: number
    y: number
  } | null>(null)
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      const quarterWidth = rect.width / 4
      const now = Date.now()

      // Determine which zone was tapped
      let zone: 'left' | 'right' | 'center'
      if (x < quarterWidth) {
        zone = 'left'
      } else if (x > quarterWidth * 3) {
        zone = 'right'
      } else {
        zone = 'center'
      }

      // Center zone: single tap toggles play/pause
      if (zone === 'center') {
        // Clear any pending single tap timeout from seek zones
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current)
          singleTapTimeoutRef.current = null
        }
        lastTapRef.current = null
        onTogglePlay()
        onShowControls()
        return
      }

      // Seek zones (left/right): require double tap to start, then stack with more taps
      const lastTap = lastTapRef.current
      const isDoubleTap = lastTap && lastTap.zone === zone && now - lastTap.time < DOUBLE_TAP_DELAY

      if (isDoubleTap) {
        // Clear single tap timeout since we're doing a double tap
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current)
          singleTapTimeoutRef.current = null
        }

        // Execute seek
        if (zone === 'left') {
          onSeekBackward()
          addRipple('left', x, y)
        } else {
          onSeekForward()
          addRipple('right', x, y)
        }

        // Update last tap time so triple+ taps continue to stack
        lastTapRef.current = { time: now, zone, x, y }
      } else {
        // First tap in a potential double tap sequence
        // Clear any existing timeout
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current)
        }

        lastTapRef.current = { time: now, zone, x, y }

        // Set timeout to clear the tap if no second tap comes
        singleTapTimeoutRef.current = setTimeout(() => {
          lastTapRef.current = null
          singleTapTimeoutRef.current = null
        }, DOUBLE_TAP_DELAY)
      }
    },
    [onSeekBackward, onSeekForward, onTogglePlay, onShowControls, addRipple]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Prevent the synthetic click event that follows touchend
      // Without this, handleTap fires twice: once for touchend, once for click
      e.preventDefault()
      handleTap(e)
    },
    [handleTap]
  )

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-12 z-10"
      onClick={handleTap}
      onTouchEnd={handleTouchEnd}
    >
      {/* Ripple animations */}
      {ripples.map(ripple => (
        <SeekRipple key={ripple.id} side={ripple.side} x={ripple.x} y={ripple.y} />
      ))}
    </div>
  )
})

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
        width: '25%',
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

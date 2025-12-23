import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMemo } from 'react'

interface PlayProgressBarProps {
  videoId: string
  duration: number
}

interface PlayPositionData {
  time: number
  duration: number
}

/**
 * Parse stored play position from localStorage
 * Handles both new JSON format and legacy string format
 */
function parseStoredPosition(saved: string | null): PlayPositionData | null {
  if (!saved) return null

  // Try parsing as JSON first (new format)
  if (saved.startsWith('{')) {
    try {
      const data = JSON.parse(saved) as { time?: number; duration?: number }
      if (typeof data.time === 'number' && !isNaN(data.time) && data.time > 0) {
        return {
          time: data.time,
          duration: typeof data.duration === 'number' ? data.duration : 0,
        }
      }
    } catch {
      // Fall through to legacy parsing
    }
  }

  // Legacy format: just a number string
  const time = parseFloat(saved)
  if (!isNaN(time) && time > 0) {
    return { time, duration: 0 }
  }

  return null
}

// Cache to avoid repeated localStorage reads for the same video
const playPosCache = new Map<string, PlayPositionData | null>()

export function PlayProgressBar({ videoId, duration }: PlayProgressBarProps) {
  const { user } = useCurrentUser()
  const posData = useMemo(() => {
    const pubkey = user?.pubkey
    if (!pubkey || !videoId) {
      return null
    }
    const key = `playpos:${pubkey}:${videoId}`

    // Check cache first
    if (playPosCache.has(key)) {
      return playPosCache.get(key) ?? null
    }

    // Read from localStorage and cache the result
    const val = localStorage.getItem(key)
    const data = parseStoredPosition(val)
    playPosCache.set(key, data)
    return data
  }, [user?.pubkey, videoId])

  // Use stored duration if available, fall back to prop
  const effectiveDuration = posData?.duration || duration
  const playPos = posData?.time ?? 0

  if (playPos <= 0 || effectiveDuration <= 0 || playPos >= effectiveDuration) {
    return null
  }

  return (
    <div className="absolute left-0 bottom-0 w-full h-1 bg-black/20 rounded-b-lg overflow-hidden">
      <div
        className="h-full bg-primary rounded-bl-lg transition-all duration-200"
        style={{ width: `${Math.min(100, (playPos / effectiveDuration) * 100)}%`, height: '4px' }}
      />
    </div>
  )
}

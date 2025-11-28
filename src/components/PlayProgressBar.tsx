import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMemo } from 'react'

interface PlayProgressBarProps {
  videoId: string
  duration: number
}

// Cache to avoid repeated localStorage reads for the same video
const playPosCache = new Map<string, number | null>()

export function PlayProgressBar({ videoId, duration }: PlayProgressBarProps) {
  const { user } = useCurrentUser()
  const playPos = useMemo(() => {
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
    if (!val) {
      playPosCache.set(key, null)
      return null
    }
    const n = parseFloat(val)
    if (Number.isNaN(n) || n <= 0) {
      playPosCache.set(key, null)
      return null
    }
    playPosCache.set(key, n)
    return n
  }, [user?.pubkey, videoId])

  if (playPos === null || duration <= 0 || playPos <= 0 || playPos >= duration) {
    return null
  }

  return (
    <div className="absolute left-0 bottom-0 w-full h-1 bg-black/20 rounded-b-lg overflow-hidden">
      <div
        className="h-full bg-primary rounded-bl-lg transition-all duration-200"
        style={{ width: `${Math.min(100, (playPos / duration) * 100)}%`, height: '4px' }}
      />
    </div>
  )
}

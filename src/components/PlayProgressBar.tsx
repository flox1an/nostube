import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useState, useEffect } from 'react'
import { getPlayPosCache, readPlayPosition, type PlayPositionData } from '@/lib/play-position-storage'

interface PlayProgressBarProps {
  videoId: string
  duration: number
}

export function PlayProgressBar({ videoId, duration }: PlayProgressBarProps) {
  const { user } = useCurrentUser()
  const [posData, setPosData] = useState<PlayPositionData | null>(null)

  useEffect(() => {
    const pubkey = user?.pubkey
    if (!pubkey || !videoId) {
      setPosData(null)
      return
    }

    // Check L1 cache synchronously to avoid flicker on already-loaded entries
    const cache = getPlayPosCache()
    const cacheKey = `${pubkey}:${videoId}`
    if (cache.has(cacheKey)) {
      setPosData(cache.get(cacheKey) ?? null)
      return
    }

    let cancelled = false
    readPlayPosition(pubkey, videoId).then(data => {
      if (!cancelled) setPosData(data)
    })
    return () => {
      cancelled = true
    }
  }, [user?.pubkey, videoId])

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

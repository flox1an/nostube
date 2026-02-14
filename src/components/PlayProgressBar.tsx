import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMemo, useState, useEffect } from 'react'
import { parseStoredPosition, getPlayPosCache, getCacheVersion } from '@/lib/play-position-storage'

interface PlayProgressBarProps {
  videoId: string
  duration: number
}

export function PlayProgressBar({ videoId, duration }: PlayProgressBarProps) {
  const { user } = useCurrentUser()
  // Force re-render when cache is invalidated
  const [version, setVersion] = useState(getCacheVersion())

  useEffect(() => {
    // Check for cache invalidation periodically
    const interval = setInterval(() => {
      setVersion(v => (v !== getCacheVersion() ? getCacheVersion() : v))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const posData = useMemo(() => {
    const pubkey = user?.pubkey
    if (!pubkey || !videoId) {
      return null
    }
    const key = `playpos:${pubkey}:${videoId}`

    // Check cache first
    const currentPlayPosCache = getPlayPosCache()
    if (currentPlayPosCache.has(key)) {
      return currentPlayPosCache.get(key) ?? null
    }

    // Read from localStorage and cache the result
    const val = localStorage.getItem(key)
    const data = parseStoredPosition(val)
    getPlayPosCache().set(key, data)
    return data
    // Note: cacheVersion triggers re-reads from localStorage via setVersion
  }, [user?.pubkey, videoId, version])

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

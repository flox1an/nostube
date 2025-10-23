import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEffect, useState } from 'react'

interface PlayProgressBarProps {
  videoId: string
  duration: number
}

export function PlayProgressBar({ videoId, duration }: PlayProgressBarProps) {
  const { user } = useCurrentUser()
  const [playPos, setPlayPos] = useState<number | null>(null)

  useEffect(() => {
    if (!user || !videoId) {
      setPlayPos(null)
      return
    }
    const key = `playpos:${user.pubkey}:${videoId}`
    const val = localStorage.getItem(key)
    if (val) {
      const n = parseFloat(val)
      if (!isNaN(n) && n > 0) {
        setPlayPos(n)
      } else {
        setPlayPos(null)
      }
    } else {
      setPlayPos(null)
    }
  }, [user, videoId])

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

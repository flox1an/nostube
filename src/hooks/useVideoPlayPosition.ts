import { useState, useEffect, useRef, useMemo } from 'react'

// Utility to parse t= parameter (supports seconds, mm:ss, h:mm:ss)
function parseTimeParam(t: string | null): number {
  if (!t) return 0
  if (/^\d+$/.test(t)) {
    // Simple seconds
    return parseInt(t, 10)
  }
  // mm:ss or h:mm:ss
  const parts = t.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) {
    // mm:ss
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    // h:mm:ss
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

interface UseVideoPlayPositionProps {
  user: { pubkey: string } | undefined
  videoId: string | undefined
  videoDuration: number | undefined
  locationSearch: string
}

/**
 * Hook that manages video play position storage and retrieval
 * - Stores play position in localStorage with debouncing
 * - Retrieves initial position from ?t= param or localStorage
 * - Handles seek events
 */
export function useVideoPlayPosition({
  user,
  videoId,
  videoDuration,
  locationSearch,
}: UseVideoPlayPositionProps) {
  const [currentPlayPos, setCurrentPlayPos] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWriteRef = useRef<number>(0)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  // Compute initial play position from ?t=... param or localStorage
  const initialPlayPos = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(locationSearch)
      const tRaw = params.get('t')
      const t = parseTimeParam(tRaw)
      if (t > 0) return t

      // If autoplay parameter is present (from playlist auto-advance), start from 0
      const autoplay = params.get('autoplay')
      if (autoplay === 'true') return 0
    }
    if (user && videoId) {
      const key = `playpos:${user.pubkey}:${videoId}`
      const saved = localStorage.getItem(key)
      if (saved) {
        const time = parseFloat(saved)
        if (
          !isNaN(time) &&
          videoDuration &&
          videoDuration - time > 5 &&
          time < videoDuration - 1
        ) {
          // Only restore if more than 5 seconds left and not at the end
          return time
        }
      }
    }
    return 0
  }, [user, videoId, videoDuration, locationSearch])

  // Debounced play position storage
  useEffect(() => {
    if (!user || !videoId) return
    if (currentPlayPos < 5) return
    const key = `playpos:${user.pubkey}:${videoId}`
    const now = Date.now()
    // If last write was more than 3s ago, write immediately
    if (now - lastWriteRef.current > 3000) {
      localStorage.setItem(key, String(currentPlayPos))
      lastWriteRef.current = now
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    } else {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        localStorage.setItem(key, String(currentPlayPos))
        lastWriteRef.current = Date.now()
        debounceRef.current = null
      }, 2000)
    }
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [currentPlayPos, user, videoId])

  // When ?t= parameter changes while on the same video, seek to the new timestamp
  useEffect(() => {
    if (typeof window !== 'undefined' && videoElementRef.current) {
      const params = new URLSearchParams(locationSearch)
      const tRaw = params.get('t')
      const t = parseTimeParam(tRaw)
      if (t > 0 && Math.abs(videoElementRef.current.currentTime - t) > 1) {
        videoElementRef.current.currentTime = t
      }
    }
  }, [locationSearch])

  // Handle custom seek events
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleSeek = (event: Event) => {
      const customEvent = event as CustomEvent<{ time?: number }>
      const targetTime = customEvent.detail?.time
      const videoEl = videoElementRef.current
      if (typeof targetTime !== 'number' || !videoEl) {
        return
      }
      videoEl.currentTime = targetTime
      setCurrentPlayPos(targetTime)
    }

    window.addEventListener('nostube:seek-to', handleSeek)

    return () => {
      window.removeEventListener('nostube:seek-to', handleSeek)
    }
  }, [])

  return {
    currentPlayPos,
    setCurrentPlayPos,
    initialPlayPos,
    videoElementRef,
  }
}

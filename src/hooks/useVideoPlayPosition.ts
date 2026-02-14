import { useState, useEffect, useRef, useMemo } from 'react'
import { invalidatePlayPosCache, parseStoredPosition } from '@/lib/play-position-storage'

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

interface PlayPositionData {
  time: number
  duration: number
}


interface UseVideoPlayPositionProps {
  user: { pubkey: string } | undefined
  videoId: string | undefined
  videoDuration: number | undefined
  locationSearch: string
}

/**
 * Hook that manages video play position storage and retrieval
 * - Stores play position and duration in localStorage with debouncing
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
  // Track actual duration from video element (more reliable than event metadata)
  const actualDurationRef = useRef<number>(0)
  // Track when video element is set so we can attach listeners
  const [videoElementReady, setVideoElementReady] = useState(false)

  // Wrapper to set videoElementRef and trigger effect
  const setVideoElement = (el: HTMLVideoElement | null) => {
    videoElementRef.current = el
    setVideoElementReady(!!el)
  }

  // Update actual duration when video element reports it
  useEffect(() => {
    const videoEl = videoElementRef.current
    if (!videoEl) return

    const updateDuration = () => {
      if (videoEl.duration && isFinite(videoEl.duration)) {
        actualDurationRef.current = videoEl.duration
      }
    }

    // Check immediately and on duration change
    updateDuration()
    videoEl.addEventListener('durationchange', updateDuration)
    videoEl.addEventListener('loadedmetadata', updateDuration)

    return () => {
      videoEl.removeEventListener('durationchange', updateDuration)
      videoEl.removeEventListener('loadedmetadata', updateDuration)
    }
  }, [videoElementReady])

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
      const data = parseStoredPosition(saved)

      if (data && data.time > 0) {
        // Use stored duration if available, fall back to event metadata
        const duration = data.duration || videoDuration || 0

        if (duration > 0) {
          // Only restore if more than 5 seconds left and not at the end
          if (duration - data.time > 5 && data.time < duration - 1) {
            return data.time
          }
          // Near the end, don't restore
          return 0
        } else {
          // No duration info at all - restore the position anyway
          return data.time
        }
      }
    }
    return 0
  }, [user, videoId, videoDuration, locationSearch])

  // Debounced play position storage (includes duration)
  useEffect(() => {
    if (!user || !videoId) return
    if (currentPlayPos < 5) return

    const key = `playpos:${user.pubkey}:${videoId}`
    const now = Date.now()

    // Get duration from video element, fall back to prop
    const duration = actualDurationRef.current || videoDuration || 0

    const savePosition = () => {
      const data: PlayPositionData = {
        time: currentPlayPos,
        duration,
      }
      localStorage.setItem(key, JSON.stringify(data))
      lastWriteRef.current = Date.now()
      // Invalidate cache so PlayProgressBar updates
      invalidatePlayPosCache(videoId, user.pubkey)
    }

    // If last write was more than 3s ago, write immediately
    if (now - lastWriteRef.current > 3000) {
      savePosition()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    } else {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        savePosition()
        debounceRef.current = null
      }, 2000)
    }
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [currentPlayPos, user, videoId, videoDuration])

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
    setVideoElement,
  }
}

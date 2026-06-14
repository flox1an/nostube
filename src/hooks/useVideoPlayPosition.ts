import { useState, useEffect, useRef } from 'react'
import { invalidatePlayPosCache, readPlayPosition, writePlayPosition } from '@/lib/play-position-storage'

function parseTimeParam(t: string | null): number {
  if (!t) return 0
  if (/^\d+$/.test(t)) {
    return parseInt(t, 10)
  }
  const parts = t.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

interface UseVideoPlayPositionProps {
  user: { pubkey: string } | undefined
  videoId: string | undefined
  videoDuration: number | undefined
  locationSearch: string
}

/**
 * Hook that manages video play position storage and retrieval.
 * - Stores play position and duration in IndexedDB with debouncing
 * - Retrieves initial position from ?t= param or IndexedDB
 * - Handles seek events
 */
export function useVideoPlayPosition({
  user,
  videoId,
  videoDuration,
  locationSearch,
}: UseVideoPlayPositionProps) {
  const [currentPlayPos, setCurrentPlayPos] = useState(0)
  const [initialPlayPos, setInitialPlayPos] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWriteRef = useRef<number>(0)
  const videoElementRef = useRef<HTMLMediaElement | null>(null)
  const actualDurationRef = useRef<number>(0)
  const [videoElementReady, setVideoElementReady] = useState(false)

  const setVideoElement = (el: HTMLMediaElement | null) => {
    videoElementRef.current = el
    setVideoElementReady(!!el)
  }

  useEffect(() => {
    const videoEl = videoElementRef.current
    if (!videoEl) return

    const updateDuration = () => {
      if (videoEl.duration && isFinite(videoEl.duration)) {
        actualDurationRef.current = videoEl.duration
      }
    }

    updateDuration()
    videoEl.addEventListener('durationchange', updateDuration)
    videoEl.addEventListener('loadedmetadata', updateDuration)

    return () => {
      videoEl.removeEventListener('durationchange', updateDuration)
      videoEl.removeEventListener('loadedmetadata', updateDuration)
    }
  }, [videoElementReady])

  // Resolve initial play position from ?t= param or IndexedDB
  useEffect(() => {
    let cancelled = false

    async function resolve() {
      const params = new URLSearchParams(locationSearch)
      const t = parseTimeParam(params.get('t'))
      if (t > 0) {
        if (!cancelled) setInitialPlayPos(t)
        return
      }

      if (params.get('autoplay') === 'true') {
        if (!cancelled) setInitialPlayPos(0)
        return
      }

      if (!user || !videoId) {
        if (!cancelled) setInitialPlayPos(0)
        return
      }

      const data = await readPlayPosition(user.pubkey, videoId)
      if (cancelled) return

      if (data && data.time > 0) {
        const duration = data.duration || videoDuration || 0
        if (duration > 0) {
          if (duration - data.time > 5 && data.time < duration - 1) {
            setInitialPlayPos(data.time)
            return
          }
          setInitialPlayPos(0)
          return
        }
        setInitialPlayPos(data.time)
        return
      }
      setInitialPlayPos(0)
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [user, videoId, videoDuration, locationSearch])

  // Debounced play position write
  useEffect(() => {
    if (!user || !videoId) return
    if (currentPlayPos < 5) return

    const now = Date.now()
    const duration = actualDurationRef.current || videoDuration || 0

    const savePosition = () => {
      writePlayPosition(user.pubkey, videoId, { time: currentPlayPos, duration })
      lastWriteRef.current = Date.now()
      invalidatePlayPosCache(videoId, user.pubkey)
    }

    if (now - lastWriteRef.current > 3000) {
      savePosition()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current)
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

  // Handle ?t= parameter changes while on the same video
  useEffect(() => {
    if (typeof window !== 'undefined' && videoElementRef.current) {
      const t = parseTimeParam(new URLSearchParams(locationSearch).get('t'))
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
      if (typeof targetTime !== 'number' || !videoEl) return
      videoEl.currentTime = targetTime
      setCurrentPlayPos(targetTime)
    }

    window.addEventListener('nostube:seek-to', handleSeek)
    return () => window.removeEventListener('nostube:seek-to', handleSeek)
  }, [])

  return {
    currentPlayPos,
    setCurrentPlayPos,
    initialPlayPos,
    videoElementRef,
    setVideoElement,
  }
}

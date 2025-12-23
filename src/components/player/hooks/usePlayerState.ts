import { useState, useEffect, useCallback, useRef } from 'react'

interface UsePlayerStateProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  onTimeUpdate?: (time: number) => void
}

interface UsePlayerStateResult {
  // Playback
  isPlaying: boolean
  currentTime: number
  duration: number
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void

  // Volume
  volume: number
  isMuted: boolean
  setVolume: (volume: number) => void
  toggleMute: () => void

  // Buffering
  bufferedPercentage: number
  isBuffering: boolean

  // Playback rate
  playbackRate: number
  setPlaybackRate: (rate: number) => void
}

/**
 * Hook to manage video player state
 */
export function usePlayerState({
  videoRef,
  onTimeUpdate,
}: UsePlayerStateProps): UsePlayerStateResult {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [bufferedPercentage, setBufferedPercentage] = useState(0)
  const [isBuffering, setIsBuffering] = useState(false)
  const [playbackRate, setPlaybackRateState] = useState(1)

  // Store previous volume for unmuting
  const previousVolumeRef = useRef(1)

  // Throttle time updates
  const lastTimeUpdateRef = useRef(0)

  // Track when video element becomes available
  const [videoReady, setVideoReady] = useState(false)

  // Poll for video element availability after mount
  useEffect(() => {
    if (videoReady) return

    const checkVideo = () => {
      if (videoRef.current) {
        setVideoReady(true)
      } else {
        requestAnimationFrame(checkVideo)
      }
    }

    requestAnimationFrame(checkVideo)
  }, [videoRef, videoReady])

  // Sync state with video element
  useEffect(() => {
    if (!videoReady) return

    const video = videoRef.current
    if (!video) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    const handleTimeUpdate = () => {
      const now = Date.now()
      // Throttle to ~4 updates per second for UI, but always update internal state
      setCurrentTime(video.currentTime)

      // Throttle callback to ~1Hz
      if (onTimeUpdate && now - lastTimeUpdateRef.current >= 1000) {
        lastTimeUpdateRef.current = now
        onTimeUpdate(video.currentTime)
      }
    }

    const handleDurationChange = () => {
      if (Number.isFinite(video.duration)) {
        setDuration(video.duration)
      }
    }

    const handleVolumeChange = () => {
      setVolumeState(video.volume)
      setIsMuted(video.muted)
    }

    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1)
        setBufferedPercentage((bufferedEnd / video.duration) * 100)
      }
    }

    const handleWaiting = () => setIsBuffering(true)
    const handleCanPlay = () => setIsBuffering(false)
    const handlePlaying = () => setIsBuffering(false)

    const handleRateChange = () => {
      setPlaybackRateState(video.playbackRate)
    }

    // Initialize state from video element
    setIsPlaying(!video.paused)
    setCurrentTime(video.currentTime)
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration)
    }
    setVolumeState(video.volume)
    setIsMuted(video.muted)
    setPlaybackRateState(video.playbackRate)

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('loadedmetadata', handleDurationChange)
    video.addEventListener('volumechange', handleVolumeChange)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('ratechange', handleRateChange)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('loadedmetadata', handleDurationChange)
      video.removeEventListener('volumechange', handleVolumeChange)
      video.removeEventListener('progress', handleProgress)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('ratechange', handleRateChange)
    }
  }, [videoRef, onTimeUpdate, videoReady])

  const play = useCallback(async () => {
    const video = videoRef.current
    if (video) {
      try {
        await video.play()
      } catch (err) {
        // Ignore autoplay errors
        if (import.meta.env.DEV) {
          console.log('Play error:', err)
        }
      }
    }
  }, [videoRef])

  const pause = useCallback(() => {
    videoRef.current?.pause()
  }, [videoRef])

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current
      if (video) {
        const clampedTime = Math.max(0, Math.min(time, video.duration || 0))
        video.currentTime = clampedTime
      }
    },
    [videoRef]
  )

  const setVolume = useCallback(
    (newVolume: number) => {
      const video = videoRef.current
      if (video) {
        const clampedVolume = Math.max(0, Math.min(1, newVolume))
        video.volume = clampedVolume
        if (clampedVolume > 0) {
          video.muted = false
          previousVolumeRef.current = clampedVolume
        }
      }
    },
    [videoRef]
  )

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) {
      if (video.muted || video.volume === 0) {
        video.muted = false
        video.volume = previousVolumeRef.current || 0.5
      } else {
        previousVolumeRef.current = video.volume
        video.muted = true
      }
    }
  }, [videoRef])

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const video = videoRef.current
      if (video) {
        video.playbackRate = rate
      }
    },
    [videoRef]
  )

  return {
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    seek,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    bufferedPercentage,
    isBuffering,
    playbackRate,
    setPlaybackRate,
  }
}

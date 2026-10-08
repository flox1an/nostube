import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as dashjs from 'dashjs'

interface UseDashResult {
  isLoading: boolean
  error: string | null
}

const DASH_EVENTS = dashjs.MediaPlayer.events
const EMPTY_RESULT: UseDashResult = { isLoading: false, error: null }

export function useDash(
  videoRef: RefObject<HTMLMediaElement | null>,
  src: string | null,
  isDashSource: boolean,
  autoPlay: boolean,
  onError?: (message: string) => void
): UseDashResult {
  const playerRef = useRef<dashjs.MediaPlayerClass | null>(null)
  const [initializedSrc, setInitializedSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shouldBeActive = useMemo(() => Boolean(src && isDashSource), [isDashSource, src])
  const isActive = shouldBeActive && initializedSrc === src

  useEffect(() => {
    const video = videoRef.current

    if (!shouldBeActive || !video || !src) {
      if (playerRef.current) {
        playerRef.current.reset()
        playerRef.current = null
      }

      queueMicrotask(() => {
        setInitializedSrc(null)
        setIsLoading(false)
        setError(null)
      })
      return
    }

    const player = dashjs.MediaPlayer().create()
    playerRef.current = player

    queueMicrotask(() => {
      setInitializedSrc(src)
      setIsLoading(true)
      setError(null)
    })

    const handleReady = () => {
      setIsLoading(false)
    }

    const handleError = (event: unknown) => {
      const details = event as {
        error?: { message?: string }
        event?: { message?: string }
        message?: string
      }
      const message =
        details.error?.message ||
        details.event?.message ||
        details.message ||
        'DASH playback failed'
      setIsLoading(false)
      setError(message)
      onError?.(message)
    }

    player.updateSettings({
      debug: {
        logLevel: dashjs.Debug.LOG_LEVEL_NONE,
      },
      streaming: {
        scheduling: {
          scheduleWhilePaused: false,
        },
        buffer: {
          fastSwitchEnabled: true,
        },
      },
    })

    player.on(DASH_EVENTS.STREAM_INITIALIZED, handleReady)
    player.on(DASH_EVENTS.PLAYBACK_STARTED, handleReady)
    player.on(DASH_EVENTS.ERROR, handleError)
    player.initialize(video, src, autoPlay)

    return () => {
      player.off(DASH_EVENTS.STREAM_INITIALIZED, handleReady)
      player.off(DASH_EVENTS.PLAYBACK_STARTED, handleReady)
      player.off(DASH_EVENTS.ERROR, handleError)
      player.reset()
      if (playerRef.current === player) {
        playerRef.current = null
      }
    }
  }, [autoPlay, onError, shouldBeActive, src, videoRef])

  if (!isActive) return EMPTY_RESULT

  return { isLoading, error }
}

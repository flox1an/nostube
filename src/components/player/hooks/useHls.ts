import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Hls from 'hls.js'

export interface HlsQualityLevel {
  index: number
  height: number
  width: number
  bitrate: number
  label: string
}

interface UseHlsResult {
  levels: HlsQualityLevel[]
  currentLevel: number // -1 = auto
  setLevel: (level: number) => void
  isLoading: boolean
  error: string | null
}

// Empty array constant to avoid new array on every render
const EMPTY_LEVELS: HlsQualityLevel[] = []

/**
 * Hook to manage hls.js instance and quality levels
 */
export function useHls(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  src: string | null,
  isHlsSource: boolean
): UseHlsResult {
  const hlsRef = useRef<Hls | null>(null)
  // State for HLS-specific data (set via HLS event callbacks)
  const [hlsLevels, setHlsLevels] = useState<HlsQualityLevel[]>(EMPTY_LEVELS)
  const [hlsCurrentLevel, setHlsCurrentLevel] = useState(-1)
  const [hlsLoading, setHlsLoading] = useState(false)
  const [hlsError, setHlsError] = useState<string | null>(null)
  // Track the source we initialized HLS with
  const [initializedSrc, setInitializedSrc] = useState<string | null>(null)

  // Determine if HLS should be active
  const shouldBeActive = useMemo(() => {
    return Boolean(src && isHlsSource)
  }, [src, isHlsSource])

  // Compute whether we're actually active (HLS initialized with current src)
  const isActive = shouldBeActive && initializedSrc === src

  // Return empty state when not active
  const levels = isActive ? hlsLevels : EMPTY_LEVELS
  const currentLevel = isActive ? hlsCurrentLevel : -1
  const isLoading = isActive ? hlsLoading : false
  const error = isActive ? hlsError : null

  // Initialize or destroy HLS instance
  useEffect(() => {
    const video = videoRef.current

    // Cleanup and exit if we shouldn't be active
    if (!shouldBeActive || !video || !src) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      // Reset state via timeout to avoid sync setState in effect
      setTimeout(() => {
        setInitializedSrc(null)
        setHlsLevels(EMPTY_LEVELS)
        setHlsCurrentLevel(-1)
        setHlsLoading(false)
        setHlsError(null)
      }, 0)
      return
    }

    // Check if HLS is supported
    if (!Hls.isSupported()) {
      // Try native HLS support (Safari)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        setTimeout(() => setInitializedSrc(src), 0)
        return
      }
      setTimeout(() => setHlsError('HLS is not supported in this browser'), 0)
      return
    }

    // Mark loading via timeout
    setTimeout(() => {
      setHlsLoading(true)
      setHlsError(null)
      setInitializedSrc(src)
    }, 0)

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
    })

    hlsRef.current = hls

    hls.loadSource(src)
    hls.attachMedia(video)

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      setHlsLoading(false)
      const qualityLevels: HlsQualityLevel[] = data.levels.map((level, index) => ({
        index,
        height: level.height,
        width: level.width,
        bitrate: level.bitrate,
        label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`,
      }))
      // Sort by height descending
      qualityLevels.sort((a, b) => b.height - a.height)
      setHlsLevels(qualityLevels)

      // Autoplay when manifest is ready
      video.play().catch(() => {
        // Autoplay blocked by browser - expected behavior
      })
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      setHlsCurrentLevel(data.level)
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.error('HLS network error, trying to recover...')
            hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.error('HLS media error, trying to recover...')
            hls.recoverMediaError()
            break
          default:
            console.error('Fatal HLS error:', data)
            setHlsError(`HLS Error: ${data.details}`)
            hls.destroy()
            break
        }
      }
    })

    return () => {
      hls.destroy()
      hlsRef.current = null
    }
  }, [videoRef, src, shouldBeActive])

  // Set quality level
  const setLevel = useCallback((level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level
      setHlsCurrentLevel(level)
    }
  }, [])

  return {
    levels,
    currentLevel,
    setLevel,
    isLoading,
    error,
  }
}

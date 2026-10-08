import { useState, useEffect, useMemo, useCallback } from 'react'

// Constants for ultra-wide / narrow video detection
const SIXTEEN_NINE_RATIO = 16 / 9
const ULTRA_WIDE_THRESHOLD = SIXTEEN_NINE_RATIO * 1.1
// Any video narrower than 16:9 (with a small tolerance) should fill height rather than width.
// This covers portrait (9:16), square (1:1), and formats like 4:3, 3:4, 2:3, etc.
const NARROW_THRESHOLD = SIXTEEN_NINE_RATIO * 0.95

interface UseUltraWideVideoProps {
  videoDimensions: string | undefined
  videoId: string | undefined
  persistedCinemaMode: boolean
}

/**
 * Hook that detects ultra-wide videos and manages temporary cinema mode
 * - Detects ultra-wide aspect ratios from metadata or video element
 * - Auto-enables temp cinema mode for ultra-wide videos (doesn't affect persisted state)
 */
export function useUltraWideVideo({
  videoDimensions,
  videoId,
  persistedCinemaMode,
}: UseUltraWideVideoProps) {
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null)
  const [tempCinemaModeForWideVideo, setTempCinemaModeForWideVideo] = useState(false)

  // Callback when video dimensions are loaded from the video element
  const handleVideoDimensionsLoaded = useCallback((width: number, height: number) => {
    const aspectRatio = width / height
    setVideoAspectRatio(aspectRatio)
  }, [])

  // Compute aspect ratio from metadata (width / height); null if unparseable
  const parsedAspectRatio = useMemo(() => {
    if (videoDimensions) {
      const match = videoDimensions.match(/(\d+)x(\d+)/)
      if (match) {
        const w = parseInt(match[1], 10)
        const h = parseInt(match[2], 10)
        if (h > 0) return w / h
      }
    }
    return null
  }, [videoDimensions])

  // Effective aspect ratio: metadata first, then from video element
  const effectiveAspectRatio = parsedAspectRatio ?? videoAspectRatio

  // Check if video is wider than 16:9 (e.g., ultra-wide video)
  const isUltraWide = useMemo(() => {
    if (effectiveAspectRatio !== null) return effectiveAspectRatio > ULTRA_WIDE_THRESHOLD
    return false
  }, [effectiveAspectRatio])

  // True for any video narrower than 16:9 — portrait, square, 4:3, etc.
  // These get a height-driven container sized to their actual aspect ratio.
  const isPortrait = useMemo(() => {
    if (effectiveAspectRatio !== null) return effectiveAspectRatio < NARROW_THRESHOLD
    return false
  }, [effectiveAspectRatio])

  // Reset aspect ratio and temp cinema mode when video changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) {
        setVideoAspectRatio(null)
        setTempCinemaModeForWideVideo(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [videoId])

  // Auto-enable TEMP cinema mode for ultra-wide videos (doesn't affect persisted state)
  useEffect(() => {
    // Don't do anything until we have the aspect ratio
    if (videoAspectRatio === null || !isUltraWide || persistedCinemaMode) return

    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) {
        setTempCinemaModeForWideVideo(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isUltraWide, videoAspectRatio, persistedCinemaMode])

  return {
    isUltraWide,
    isPortrait,
    effectiveAspectRatio,
    tempCinemaModeForWideVideo,
    setTempCinemaModeForWideVideo,
    handleVideoDimensionsLoaded,
  }
}

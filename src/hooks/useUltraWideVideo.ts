import { useState, useEffect, useMemo, useCallback } from 'react'

// Constants for ultra-wide video detection
const SIXTEEN_NINE_RATIO = 16 / 9
const ULTRA_WIDE_THRESHOLD = SIXTEEN_NINE_RATIO * 1.05

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

  // Check if video is wider than 16:9 (e.g., ultra-wide video)
  const isUltraWide = useMemo(() => {
    // First try to get dimensions from video metadata
    if (videoDimensions) {
      const match = videoDimensions.match(/(\d+)x(\d+)/)
      if (match) {
        const width = parseInt(match[1], 10)
        const height = parseInt(match[2], 10)
        const aspectRatio = width / height
        return aspectRatio > ULTRA_WIDE_THRESHOLD
      }
    }

    // Fall back to video element dimensions
    if (videoAspectRatio !== null) {
      return videoAspectRatio > ULTRA_WIDE_THRESHOLD
    }

    return false
  }, [videoDimensions, videoAspectRatio])

  // Reset aspect ratio and temp cinema mode when video changes
  useEffect(() => {
    setVideoAspectRatio(null)
    setTempCinemaModeForWideVideo(false)
  }, [videoId])

  // Auto-enable TEMP cinema mode for ultra-wide videos (doesn't affect persisted state)
  useEffect(() => {
    // Don't do anything until we have the aspect ratio
    if (videoAspectRatio === null) return

    // Enable temp cinema mode for ultra-wide videos (if not already in cinema mode via user preference)
    if (isUltraWide && !persistedCinemaMode) {
      setTempCinemaModeForWideVideo(true)
    }
  }, [isUltraWide, videoAspectRatio, persistedCinemaMode])

  return {
    isUltraWide,
    tempCinemaModeForWideVideo,
    setTempCinemaModeForWideVideo,
    handleVideoDimensionsLoaded,
  }
}

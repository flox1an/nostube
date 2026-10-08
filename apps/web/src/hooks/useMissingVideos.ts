import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { useToast } from './useToast'

interface MissingVideoData {
  failedAt: number
  urls: string[]
  retryAfter?: number
  attemptCount: number
}

type MissingVideosMap = Record<string, MissingVideoData>

const STORAGE_KEY = 'missing-videos'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// Retry schedule
const RETRY_SCHEDULE = [
  1 * HOUR_MS, // 1st failure: retry after 1 hour
  6 * HOUR_MS, // 2nd failure: retry after 6 hours
  24 * HOUR_MS, // 3rd+ failure: retry after 24 hours
]

const PERMANENT_FAILURE_THRESHOLD = 7 * DAY_MS // After 7 days, consider permanent

export function useMissingVideos() {
  const [missingVideos, setMissingVideos] = useLocalStorage<MissingVideosMap>(STORAGE_KEY, {})
  const { toast } = useToast()

  /**
   * Mark a video as missing/failed to load
   */
  const markVideoAsMissing = useCallback(
    (videoId: string, urls: string[]) => {
      const now = Date.now()
      const existing = missingVideos[videoId]
      const attemptCount = existing ? existing.attemptCount + 1 : 1

      // Calculate retry time based on attempt count
      const retryDelayIndex = Math.min(attemptCount - 1, RETRY_SCHEDULE.length - 1)
      const retryDelay = RETRY_SCHEDULE[retryDelayIndex]
      const retryAfter = now + retryDelay

      setMissingVideos(prev => ({
        ...prev,
        [videoId]: {
          failedAt: now,
          urls,
          retryAfter,
          attemptCount,
        },
      }))

      // Show toast notification
      toast({
        title: 'Video unavailable',
        description: `This video could not be loaded from any source. It will be filtered from your feed.`,
        variant: 'destructive',
      })
    },
    [missingVideos, setMissingVideos, toast]
  )

  /**
   * Check if a video should be considered missing (and filtered out)
   * Returns false if it's time to retry
   */
  const isVideoMissing = useCallback(
    (videoId: string): boolean => {
      const video = missingVideos[videoId]
      if (!video) return false

      const now = Date.now()

      // Check if it's been more than 7 days since first failure
      if (now - video.failedAt > PERMANENT_FAILURE_THRESHOLD) {
        return true // Permanently failed
      }

      // Check if we should retry
      if (video.retryAfter && now >= video.retryAfter) {
        return false // Time to retry
      }

      return true // Still in cooldown period
    },
    [missingVideos]
  )

  /**
   * Clear a specific video from the missing list (manual retry)
   */
  const clearMissingVideo = useCallback(
    (videoId: string) => {
      setMissingVideos(prev => {
        const updated = { ...prev }
        delete updated[videoId]
        return updated
      })

      toast({
        title: 'Video restored',
        description: 'The video has been removed from the missing list.',
      })
    },
    [setMissingVideos, toast]
  )

  /**
   * Get all missing videos (for settings UI)
   */
  const getAllMissingVideos = useCallback(() => {
    return missingVideos
  }, [missingVideos])

  /**
   * Clear all missing videos
   */
  const clearAllMissing = useCallback(() => {
    setMissingVideos({})
    toast({
      title: 'List cleared',
      description: 'All missing videos have been removed from the list.',
    })
  }, [setMissingVideos, toast])

  /**
   * Get count of currently filtered videos
   */
  const getMissingCount = useCallback(() => {
    const now = Date.now()
    return Object.entries(missingVideos).filter(([_, video]) => {
      if (now - video.failedAt > PERMANENT_FAILURE_THRESHOLD) {
        return true
      }
      if (video.retryAfter && now >= video.retryAfter) {
        return false
      }
      return true
    }).length
  }, [missingVideos])

  /**
   * Get videos ready for retry
   */
  const getVideosReadyForRetry = useCallback(() => {
    const now = Date.now()
    return Object.entries(missingVideos)
      .filter(([_, video]) => video.retryAfter && now >= video.retryAfter)
      .map(([id]) => id)
  }, [missingVideos])

  return {
    markVideoAsMissing,
    isVideoMissing,
    clearMissingVideo,
    getAllMissingVideos,
    clearAllMissing,
    getMissingCount,
    getVideosReadyForRetry,
  }
}

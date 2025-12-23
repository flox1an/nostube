import { useEffect, useRef, useCallback, useMemo } from 'react'
import { type VideoVariant } from '@/utils/video-event'

// Quality levels in descending order (highest first)
const QUALITY_ORDER = ['4320p', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p']

// Empty array constant to avoid creating new array on every render
const EMPTY_INDICES: number[] = []

interface UseAdaptiveQualityOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  videoVariants?: VideoVariant[]
  selectedVariantIndex: number
  onVariantChange: (index: number) => void
  enabled?: boolean
}

/**
 * Hook that monitors video buffering and automatically switches to a lower quality
 * when the network is too slow to sustain the current quality.
 *
 * Triggers a quality downgrade when:
 * - 3 or more buffering events occur within 30 seconds, OR
 * - Buffer health drops below 2 seconds while playing
 */
export function useAdaptiveQuality({
  videoRef,
  videoVariants,
  selectedVariantIndex,
  onVariantChange,
  enabled = true,
}: UseAdaptiveQualityOptions) {
  const bufferingEventsRef = useRef<number[]>([])
  const lastDowngradeTimeRef = useRef<number>(0)
  const isBufferingRef = useRef(false)

  // Memoized sorted variant indices (highest to lowest quality)
  const sortedVariantIndices = useMemo(() => {
    if (!videoVariants || videoVariants.length <= 1) return EMPTY_INDICES

    return videoVariants
      .map((v, index) => ({ variant: v, index }))
      .sort((a, b) => {
        const aOrder = QUALITY_ORDER.indexOf(a.variant.quality || '')
        const bOrder = QUALITY_ORDER.indexOf(b.variant.quality || '')
        // Unknown qualities go to the end
        const aIdx = aOrder === -1 ? QUALITY_ORDER.length : aOrder
        const bIdx = bOrder === -1 ? QUALITY_ORDER.length : bOrder
        return aIdx - bIdx
      })
      .map(item => item.index)
  }, [videoVariants])

  // Find the next lower quality variant index
  const getNextLowerQualityIndex = useCallback((): number | null => {
    if (sortedVariantIndices.length <= 1) return null

    const currentPosInSorted = sortedVariantIndices.indexOf(selectedVariantIndex)
    if (currentPosInSorted === -1) return null

    // Next lower quality is the next item in the sorted array
    const nextPos = currentPosInSorted + 1
    if (nextPos >= sortedVariantIndices.length) return null // Already at lowest

    return sortedVariantIndices[nextPos]
  }, [sortedVariantIndices, selectedVariantIndex])

  // Attempt to downgrade quality
  const attemptDowngrade = useCallback(() => {
    const now = Date.now()

    // Don't downgrade more than once every 10 seconds
    if (now - lastDowngradeTimeRef.current < 10000) return

    const nextLowerIndex = getNextLowerQualityIndex()
    if (nextLowerIndex === null) {
      if (import.meta.env.DEV) {
        console.log('[AdaptiveQuality] Already at lowest quality, cannot downgrade')
      }
      return
    }

    const currentQuality = videoVariants?.[selectedVariantIndex]?.quality || 'unknown'
    const nextQuality = videoVariants?.[nextLowerIndex]?.quality || 'unknown'

    if (import.meta.env.DEV) {
      console.log(`[AdaptiveQuality] Downgrading from ${currentQuality} to ${nextQuality}`)
    }

    lastDowngradeTimeRef.current = now
    bufferingEventsRef.current = [] // Reset buffering counter after downgrade
    onVariantChange(nextLowerIndex)
  }, [getNextLowerQualityIndex, videoVariants, selectedVariantIndex, onVariantChange])

  useEffect(() => {
    if (!enabled) return
    if (!videoVariants || videoVariants.length <= 1) return

    const video = videoRef.current
    if (!video) return

    const handleWaiting = () => {
      if (isBufferingRef.current) return
      isBufferingRef.current = true

      const now = Date.now()
      bufferingEventsRef.current.push(now)

      // Keep only events from the last 30 seconds
      const thirtySecondsAgo = now - 30000
      bufferingEventsRef.current = bufferingEventsRef.current.filter(t => t > thirtySecondsAgo)

      if (import.meta.env.DEV) {
        console.log(
          `[AdaptiveQuality] Buffering event #${bufferingEventsRef.current.length} in last 30s`
        )
      }

      // Trigger downgrade if 3+ buffering events in 30 seconds
      if (bufferingEventsRef.current.length >= 3) {
        attemptDowngrade()
      }
    }

    const handlePlaying = () => {
      isBufferingRef.current = false
    }

    const handleCanPlay = () => {
      isBufferingRef.current = false
    }

    // Check buffer health periodically while playing
    let bufferCheckInterval: number | null = null

    const startBufferCheck = () => {
      if (bufferCheckInterval) return

      bufferCheckInterval = window.setInterval(() => {
        if (video.paused || video.ended) return

        const buffered = video.buffered
        if (buffered.length === 0) return

        // Find buffer range containing current time
        let bufferAhead = 0
        for (let i = 0; i < buffered.length; i++) {
          if (video.currentTime >= buffered.start(i) && video.currentTime <= buffered.end(i)) {
            bufferAhead = buffered.end(i) - video.currentTime
            break
          }
        }

        // If less than 2 seconds buffered ahead while playing, consider downgrade
        if (bufferAhead < 2 && !video.paused && video.playbackRate > 0) {
          if (import.meta.env.DEV) {
            console.log(`[AdaptiveQuality] Low buffer: ${bufferAhead.toFixed(1)}s ahead`)
          }
          attemptDowngrade()
        }
      }, 2000) // Check every 2 seconds
    }

    const stopBufferCheck = () => {
      if (bufferCheckInterval) {
        clearInterval(bufferCheckInterval)
        bufferCheckInterval = null
      }
    }

    const handlePlay = () => startBufferCheck()
    const handlePause = () => stopBufferCheck()
    const handleEnded = () => stopBufferCheck()

    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    // Start checking if already playing
    if (!video.paused) {
      startBufferCheck()
    }

    return () => {
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      stopBufferCheck()
    }
  }, [enabled, videoRef, videoVariants, attemptDowngrade])

  // Reset buffering counter when variant changes
  useEffect(() => {
    bufferingEventsRef.current = []
  }, [selectedVariantIndex])
}

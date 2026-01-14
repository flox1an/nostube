/**
 * Video Variant Selector Hook
 *
 * Manages quality variant selection with position preservation when switching.
 * Computes effective URLs and hash based on selected variant.
 */

import { useState, useMemo, useCallback, useEffect, useRef, type RefObject } from 'react'
import type { VideoVariant } from '@/utils/video-event'

interface UseVideoVariantSelectorOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  videoVariants?: VideoVariant[]
  urls: string[]
  sha256?: string
}

interface UseVideoVariantSelectorResult {
  selectedVariantIndex: number
  effectiveUrls: string[]
  effectiveSha256: string | undefined
  handleVariantChange: (index: number) => void
}

/**
 * Hook for managing video quality variant selection with playback position preservation.
 * Automatically selects 1080p or 720p as default if available.
 */
export function useVideoVariantSelector({
  videoRef,
  videoVariants,
  urls,
  sha256,
}: UseVideoVariantSelectorOptions): UseVideoVariantSelectorResult {
  // Compute default quality index: prefer 1080p, then 720p, else first
  const defaultQualityIndex = useMemo(() => {
    if (!videoVariants || videoVariants.length === 0) return 0
    const idx1080 = videoVariants.findIndex(v => v.quality === '1080p')
    if (idx1080 !== -1) return idx1080
    const idx720 = videoVariants.findIndex(v => v.quality === '720p')
    if (idx720 !== -1) return idx720
    return 0
  }, [videoVariants])

  const [selectedVariantIndex, setSelectedVariantIndex] = useState(defaultQualityIndex)

  // Refs to track position restoration across quality changes
  const pendingSeekTimeRef = useRef<number | null>(null)
  const wasPlayingRef = useRef(false)

  // Compute URLs based on selected variant
  const effectiveUrls = useMemo(() => {
    if (videoVariants && videoVariants.length > 0 && selectedVariantIndex < videoVariants.length) {
      const variant = videoVariants[selectedVariantIndex]
      return [variant.url, ...variant.fallbackUrls]
    }
    return urls
  }, [videoVariants, selectedVariantIndex, urls])

  const effectiveSha256 = useMemo(() => {
    if (videoVariants && videoVariants.length > 0 && selectedVariantIndex < videoVariants.length) {
      return videoVariants[selectedVariantIndex].hash || sha256
    }
    return sha256
  }, [videoVariants, selectedVariantIndex, sha256])

  // Handle quality change with position preservation
  const handleVariantChange = useCallback(
    (newIndex: number) => {
      if (newIndex === selectedVariantIndex) return

      const el = videoRef.current
      if (el) {
        pendingSeekTimeRef.current = el.currentTime
        wasPlayingRef.current = !el.paused
      }
      setSelectedVariantIndex(newIndex)
    },
    [selectedVariantIndex, videoRef]
  )

  // Restore playback position after quality change
  useEffect(() => {
    if (pendingSeekTimeRef.current === null) return

    const el = videoRef.current
    if (!el) return

    const handleCanPlay = () => {
      if (pendingSeekTimeRef.current !== null) {
        el.currentTime = pendingSeekTimeRef.current
        pendingSeekTimeRef.current = null
        if (wasPlayingRef.current) {
          el.play().catch(() => {})
        }
      }
    }

    el.addEventListener('canplay', handleCanPlay, { once: true })
    return () => el.removeEventListener('canplay', handleCanPlay)
  }, [selectedVariantIndex, videoRef])

  return {
    selectedVariantIndex,
    effectiveUrls,
    effectiveSha256,
    handleVariantChange,
  }
}

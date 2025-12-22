import { useState, useMemo, useCallback } from 'react'
import type { VideoVariant } from '@/utils/video-event'
import type { BlossomServer } from '@/contexts/AppContext'
import { extractBlossomHash } from '@/lib/blossom-url'
import {
  type ServerInfo,
  type ServerAvailability,
  extractServerList,
  checkBlossomServer,
} from '@/lib/server-availability'

export interface VariantAvailability {
  variant: VideoVariant
  label: string // e.g., "Video 1", "Video 2", "Thumbnail"
  serverList: ServerInfo[]
  serverAvailability: Map<string, ServerAvailability>
  checkAvailability: () => Promise<void>
  isChecking: boolean
}

interface UseMultiVideoServerAvailabilityParams {
  videoVariants: VideoVariant[]
  thumbnailVariants: VideoVariant[]
  configServers?: BlossomServer[]
  userServers?: string[]
}

interface UseMultiVideoServerAvailabilityReturn {
  videoVariants: VariantAvailability[]
  thumbnailVariants: VariantAvailability[]
  allVariants: VariantAvailability[] // Combined for easy iteration
  checkAllAvailability: () => Promise<void>
  isAnyChecking: boolean
}

/**
 * Hook to manage server availability for multiple video variants and thumbnails
 */
export function useMultiVideoServerAvailability(
  params: UseMultiVideoServerAvailabilityParams
): UseMultiVideoServerAvailabilityReturn {
  const { videoVariants, thumbnailVariants, configServers, userServers } = params

  // Create availability state for each variant
  const [variantStates, setVariantStates] = useState<Map<number, Map<string, ServerAvailability>>>(
    new Map()
  )
  const [checkingStates, setCheckingStates] = useState<Map<number, boolean>>(new Map())

  // Helper to generate a descriptive label for a variant
  const getVariantLabel = (
    variant: VideoVariant,
    index: number,
    total: number,
    type: 'Video' | 'Thumbnail'
  ) => {
    // Build quality/dimension string
    let qualityStr = ''
    if (variant.quality) {
      qualityStr = variant.quality
    } else if (variant.dimensions) {
      // Extract height from dimensions (e.g., "1920x1080" -> "1080p")
      const match = variant.dimensions.match(/x(\d+)/)
      if (match) {
        qualityStr = `${match[1]}p`
      } else {
        qualityStr = variant.dimensions
      }
    }

    if (total === 1) {
      return qualityStr ? `${type} (${qualityStr})` : type
    }
    return qualityStr ? `${type} ${index + 1} (${qualityStr})` : `${type} ${index + 1}`
  }

  // Combine all variants with metadata
  const allVariantsMetadata = useMemo(() => {
    const result: Array<{
      variant: VideoVariant
      label: string
      index: number
      isVideo: boolean
    }> = []

    videoVariants.forEach((variant, index) => {
      result.push({
        variant,
        label: getVariantLabel(variant, index, videoVariants.length, 'Video'),
        index: result.length,
        isVideo: true,
      })
    })

    thumbnailVariants.forEach((variant, index) => {
      result.push({
        variant,
        label: getVariantLabel(variant, index, thumbnailVariants.length, 'Thumbnail'),
        index: result.length,
        isVideo: false,
      })
    })

    return result
  }, [videoVariants, thumbnailVariants])

  // Extract server lists for each variant
  const variantServerLists = useMemo(() => {
    return allVariantsMetadata.map(({ variant }) => {
      const variantUrls = [variant.url, ...variant.fallbackUrls]
      return extractServerList(variantUrls, configServers, userServers)
    })
  }, [allVariantsMetadata, configServers, userServers])

  // Check availability for a specific variant
  const checkVariantAvailability = useCallback(
    async (variantIndex: number) => {
      const { variant } = allVariantsMetadata[variantIndex]
      const serverList = variantServerLists[variantIndex]

      if (!variant || !serverList) return

      // Extract hash and extension
      const { sha256 } = extractBlossomHash(variant.url)
      const ext =
        variant.url.split('.').pop() || (variant.mimeType?.includes('video') ? 'mp4' : 'jpg')

      if (!sha256) {
        if (import.meta.env.DEV) {
          console.warn(
            `[useMultiVideoServerAvailability] Cannot check availability: missing hash for variant ${variantIndex}`
          )
        }
        return
      }

      setCheckingStates(prev => new Map(prev).set(variantIndex, true))

      // Set all servers to 'checking' status
      setVariantStates(prev => {
        const updated = new Map(prev)
        const variantMap = new Map<string, ServerAvailability>()
        serverList.forEach(server => {
          variantMap.set(server.url, {
            ...server,
            status: 'checking',
          })
        })
        updated.set(variantIndex, variantMap)
        return updated
      })

      // Check each server in parallel
      const checks = serverList.map(async server => {
        const result = await checkBlossomServer(server.url, sha256, ext)

        // Update state with result
        setVariantStates(prev => {
          const updated = new Map(prev)
          const variantMap = new Map(updated.get(variantIndex))
          variantMap.set(server.url, {
            ...server,
            ...result,
          })
          updated.set(variantIndex, variantMap)
          return updated
        })
      })

      await Promise.allSettled(checks)

      setCheckingStates(prev => new Map(prev).set(variantIndex, false))
    },
    [allVariantsMetadata, variantServerLists]
  )

  // Check availability for all variants
  const checkAllAvailability = useCallback(async () => {
    await Promise.all(allVariantsMetadata.map((_, index) => checkVariantAvailability(index)))
  }, [allVariantsMetadata, checkVariantAvailability])

  // Build variant availability objects
  const variantAvailabilities = useMemo(() => {
    return allVariantsMetadata.map(({ variant, label, index }) => ({
      variant,
      label,
      serverList: variantServerLists[index] || [],
      serverAvailability: variantStates.get(index) || new Map(),
      checkAvailability: () => checkVariantAvailability(index),
      isChecking: checkingStates.get(index) || false,
    }))
  }, [
    allVariantsMetadata,
    variantServerLists,
    variantStates,
    checkingStates,
    checkVariantAvailability,
  ])

  // Split into video and thumbnail variants
  const videoVariantResults = variantAvailabilities.slice(0, videoVariants.length)
  const thumbnailVariantResults = variantAvailabilities.slice(videoVariants.length)

  // Check if any variant is currently checking
  const isAnyChecking = Array.from(checkingStates.values()).some(Boolean)

  return {
    videoVariants: videoVariantResults,
    thumbnailVariants: thumbnailVariantResults,
    allVariants: variantAvailabilities,
    checkAllAvailability,
    isAnyChecking,
  }
}

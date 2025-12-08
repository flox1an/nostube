import { populateBinaryFuse8 } from 'binary-fuse-filter'
import { useMemo, useCallback } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'

interface FilterMetadata {
  totalVideos: number
  unavailableCount: number
  falsePositiveRate: number
  builtAt: number
  loadedAt: number
}

interface CachedFilter {
  filterJSON: string
  metadata: FilterMetadata
}

const CACHE_KEY = 'unavailable-videos-filter'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

// Service pubkey will be configured here once the service is deployed
// For now, this will gracefully return no filter
const SERVICE_PUBKEY = import.meta.env.VITE_FILTER_SERVICE_PUBKEY || ''

/**
 * Hook to subscribe to unavailable videos filter published to Nostr
 * Uses binary-fuse filter for fast O(1) lookups with <1% false positive rate
 */
export function useUnavailableVideosFilter() {
  const eventStore = useEventStore()

  // Subscribe to filter events (kind 31000 with d="unavailable-videos")
  const filterTimeline$ = useMemo(() => {
    // If no service pubkey configured, return empty observable
    if (!SERVICE_PUBKEY) {
      return eventStore.timeline({ kinds: [0], authors: [], limit: 0 }) // Empty query
    }

    return eventStore.timeline({
      kinds: [31000],
      authors: [SERVICE_PUBKEY],
      '#d': ['unavailable-videos'],
      limit: 1,
    })
  }, [eventStore])

  const filterEvents = useObservableState(filterTimeline$, [])

  // Get the latest filter event
  const latestEvent = useMemo(() => {
    return filterEvents && filterEvents.length > 0 ? filterEvents[0] : null
  }, [filterEvents])

  // Parse and cache filter
  const { filter, metadata } = useMemo(() => {
    // Try cache first
    const cached = loadFromCache()
    const now = Date.now()

    // Use cache if fresh and no newer event
    if (cached && now - cached.metadata.loadedAt < CACHE_TTL) {
      if (!latestEvent || latestEvent.created_at * 1000 <= cached.metadata.builtAt) {
        try {
          const [filter, err] = populateBinaryFuse8([])
          if (err) throw err
          filter.takeJSON(cached.filterJSON)
          return { filter, metadata: cached.metadata }
        } catch (error) {
          console.error('Failed to restore cached filter:', error)
          // Continue to parse from event
        }
      }
    }

    // Parse from latest event
    if (!latestEvent) {
      return { filter: null, metadata: null }
    }

    try {
      const filterJSON = latestEvent.content

      // Parse filter
      const [filter, err] = populateBinaryFuse8([])
      if (err) throw err
      filter.takeJSON(filterJSON)

      // Extract metadata from tags
      const metadata: FilterMetadata = {
        totalVideos: parseInt(latestEvent.tags.find(t => t[0] === 'total')?.[1] || '0'),
        unavailableCount: parseInt(
          latestEvent.tags.find(t => t[0] === 'unavailable')?.[1] || '0'
        ),
        falsePositiveRate: parseFloat(latestEvent.tags.find(t => t[0] === 'fpr')?.[1] || '0.004'),
        builtAt: latestEvent.created_at * 1000,
        loadedAt: Date.now(),
      }

      // Save to cache
      saveToCache({ filterJSON, metadata })

      return { filter, metadata }
    } catch (error) {
      console.error('Failed to parse filter from Nostr event:', error)
      return { filter: null, metadata: null }
    }
  }, [latestEvent])

  // Check if video is unavailable
  const isVideoUnavailable = useCallback(
    (videoId: string): boolean => {
      if (!filter) return false

      try {
        // Convert video ID (hex string) to BigInt for filter lookup
        // Use first 16 hex chars (8 bytes) for consistent hashing
        const hash = BigInt('0x' + videoId.substring(0, 16))
        return filter.contains(hash)
      } catch (error) {
        // If conversion fails, assume video is available
        console.warn('Failed to check video availability:', error)
        return false
      }
    },
    [filter]
  )

  return {
    isVideoUnavailable,
    metadata,
    isLoaded: !!filter,
  }
}

/**
 * Load cached filter from localStorage
 */
function loadFromCache(): CachedFilter | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null
    return JSON.parse(cached)
  } catch (error) {
    console.warn('Failed to load filter cache:', error)
    return null
  }
}

/**
 * Save filter to localStorage cache
 */
function saveToCache(data: CachedFilter): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to save filter cache:', error)
    // Ignore cache errors - filter will work without cache
  }
}

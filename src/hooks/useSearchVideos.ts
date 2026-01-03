import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { useAppContext, useReportedPubkeys } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { type NostrEvent } from 'nostr-tools'
import type { VideoEvent } from '@/utils/video-event'
import { RelayPool } from 'applesauce-relay'

// Dedicated relay pool for search - only uses relay.nostr.band
const SEARCH_RELAY = 'wss://relay.nostr.band'
const SEARCH_RELAYS = [SEARCH_RELAY]
let searchPool: RelayPool | null = null

function getSearchPool(): RelayPool {
  if (!searchPool) {
    searchPool = new RelayPool()
  }
  return searchPool
}

interface UseSearchVideosOptions {
  /**
   * Search query string
   */
  query: string | null

  /**
   * Video kinds to search (default: all video kinds)
   */
  kinds?: number[]

  /**
   * Optional limit for initial load (default: 50)
   */
  limit?: number
}

/**
 * Hook for searching videos using NIP-50 full-text search.
 * Uses a dedicated relay pool that only connects to relay.nostr.band.
 *
 * @example
 * const { videos, loading, loadMore } = useSearchVideos({ query: 'bitcoin' })
 */
export function useSearchVideos({
  query,
  kinds = [21, 22, 34235, 34236], // All video kinds
  limit = 50,
}: UseSearchVideosOptions): {
  videos: VideoEvent[]
  loading: boolean
  hasLoaded: boolean
  loadMore: () => void
} {
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const { presetContent } = useSelectedPreset()
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [events, setEvents] = useState<NostrEvent[]>([])

  // Create NIP-50 search filter
  const filters = useMemo(() => {
    if (!query) {
      return null
    }
    const searchFilter = {
      kinds,
      search: query, // NIP-50 full-text search
    }

    // Debug: Log the filter being sent to relay
    if (import.meta.env.DEV) {
      console.log('🔍 NIP-50 Search Filter:', JSON.stringify(searchFilter, null, 2))
    }

    return searchFilter
  }, [query, kinds])

  // Process events - only use search relay for discovery
  const videos = useMemo(() => {
    return processEvents(
      events,
      SEARCH_RELAYS,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )
  }, [events, blockedPubkeys, config.blossomServers, presetContent.nsfwPubkeys])

  // Load initial events from search relay
  useEffect(() => {
    if (!filters || hasLoaded) return

    const pool = getSearchPool()
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) {
        setLoading(true)
      }
    })()

    // Debug: Log the actual REQ being sent
    if (import.meta.env.DEV) {
      console.log('🔍 Sending NIP-50 REQ to relay.nostr.band:', {
        relay: SEARCH_RELAY,
        filter: filters,
      })
    }

    const loader = createTimelineLoader(pool, SEARCH_RELAYS, filters, {
      eventStore,
      limit,
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
        setEvents(prev => [...prev, event])
      },
      complete: () => {
        if (cancelled) {
          return
        }
        setLoading(false)
        setHasLoaded(true)
      },
      error: err => {
        console.error('Error searching videos:', err)
        if (cancelled) {
          return
        }
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [filters, eventStore, hasLoaded, limit])

  // Reset hasLoaded and events when query changes
  useEffect(() => {
    if (query === undefined || query === null) {
      return
    }
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) {
        setHasLoaded(false)
        setEvents([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [query])

  // Load more videos (pagination)
  const loadMore = useCallback(() => {
    if (!filters || loading) return

    const pool = getSearchPool()
    setLoading(true)
    // Get the oldest event timestamp for pagination
    const oldestEvent = videos.length > 0 ? videos[videos.length - 1] : null
    const until = oldestEvent?.created_at

    const paginatedFilters = until ? { ...filters, until } : filters

    const loader = createTimelineLoader(pool, SEARCH_RELAYS, paginatedFilters, {
      eventStore,
      limit,
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
        setEvents(prev => [...prev, event])
      },
      complete: () => {
        setLoading(false)
      },
      error: err => {
        console.error('Error loading more search results:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, eventStore, loading, videos, limit])

  return {
    videos,
    loading,
    hasLoaded,
    loadMore,
  }
}

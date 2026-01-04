import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { useAppContext, useReportedPubkeys } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { type NostrEvent } from 'nostr-tools'
import type { VideoEvent } from '@/utils/video-event'
import { RelayPool } from 'applesauce-relay'
import { of, type Subscription } from 'rxjs'

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
 * Uses use$ to subscribe to EventStore for reactive updates.
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
  // Store subscription ref to keep it alive during loadMore
  const loadMoreSubscriptionRef = useRef<Subscription | null>(null)

  // Create NIP-50 search filter (without the search param for EventStore query)
  const storeFilter = useMemo(() => {
    if (!query) return null
    return { kinds }
  }, [query, kinds])

  // Create full NIP-50 search filter for relay query
  const searchFilter = useMemo(() => {
    if (!query) return null

    const filter = {
      kinds,
      search: query, // NIP-50 full-text search
    }

    if (import.meta.env.DEV) {
      console.log('🔍 NIP-50 Search Filter:', JSON.stringify(filter, null, 2))
    }

    return filter
  }, [query, kinds])

  // Subscribe to EventStore for reactive updates as events arrive
  // Note: EventStore doesn't support NIP-50 search, so we query by kinds only
  // and filter client-side based on what the search relay returned
  const events = use$(() => {
    if (!storeFilter) return of([])
    return eventStore.timeline(storeFilter)
  }, [eventStore, storeFilter])

  // Process events - only use search relay for discovery
  const videos = useMemo(() => {
    const eventList = events ?? []
    return processEvents(
      eventList,
      SEARCH_RELAYS,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )
  }, [events, blockedPubkeys, config.blossomServers, presetContent.nsfwPubkeys])

  // Reset hasLoaded when query changes to trigger reload
  useEffect(() => {
    if (query === undefined || query === null) return
    queueMicrotask(() => {
      setHasLoaded(false)
      setLoading(true)
    })
  }, [query])

  // Load initial events from search relay
  useEffect(() => {
    if (!searchFilter || hasLoaded) return

    const pool = getSearchPool()
    queueMicrotask(() => setLoading(true))

    const loader = createTimelineLoader(pool, SEARCH_RELAYS, searchFilter, {
      eventStore,
      limit,
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        setLoading(false)
        setHasLoaded(true)
      },
      error: err => {
        console.error('Error searching videos:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [searchFilter, eventStore, hasLoaded, limit])

  // Cleanup loadMore subscription on unmount
  useEffect(() => {
    return () => {
      loadMoreSubscriptionRef.current?.unsubscribe()
    }
  }, [])

  // Load more videos (pagination)
  const loadMore = useCallback(() => {
    if (!searchFilter || loading) return

    // Clean up any previous loadMore subscription
    loadMoreSubscriptionRef.current?.unsubscribe()

    const pool = getSearchPool()
    setLoading(true)
    // Get the oldest event timestamp for pagination
    const oldestEvent = videos.length > 0 ? videos[videos.length - 1] : null
    const until = oldestEvent?.created_at

    const paginatedFilters = until ? { ...searchFilter, until } : searchFilter

    const loader = createTimelineLoader(pool, SEARCH_RELAYS, paginatedFilters, {
      eventStore,
      limit,
    })

    loadMoreSubscriptionRef.current = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        setLoading(false)
      },
      error: err => {
        console.error('Error loading more search results:', err)
        setLoading(false)
      },
    })
  }, [searchFilter, eventStore, loading, videos, limit])

  return {
    videos,
    loading,
    hasLoaded,
    loadMore,
  }
}

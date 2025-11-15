import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { useAppContext, useReportedPubkeys } from '@/hooks'
import { map } from 'rxjs'
import { NostrEvent } from 'nostr-tools'
import type { VideoEvent } from '@/utils/video-event'

interface UseTimelineLoaderOptions {
  /**
   * Nostr filters for the timeline query
   */
  filters: any | null

  /**
   * Relays to query (should be stable reference)
   */
  relays: string[]

  /**
   * Optional dependency to trigger reload (e.g., tag, pubkey)
   * When this changes, the timeline will be reloaded
   */
  reloadDependency?: any

  /**
   * Optional limit for initial load (default: 50)
   */
  limit?: number

  /**
   * Optional timeout per relay in milliseconds (default: 5000)
   */
  timeout?: number
}

/**
 * Hook for loading Nostr timeline with pagination and caching via EventStore.
 * Encapsulates the common pattern of:
 * 1. Subscribe to EventStore.timeline() for reactive updates
 * 2. Load initial events from relays via createTimelineLoader
 * 3. Provide loadMore function for pagination
 *
 * @example
 * const filters = useMemo(() => ({ kinds: [34235], authors: [pubkey] }), [pubkey])
 * const { videos, loading, loadMore } = useTimelineLoader({ filters, relays })
 */
export function useTimelineLoader({
  filters,
  relays,
  reloadDependency,
  limit = 50,
  timeout = 5000,
}: UseTimelineLoaderOptions): {
  videos: VideoEvent[]
  loading: boolean
  hasLoaded: boolean
  loadMore: () => void
} {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Subscribe to events from EventStore for reactive updates
  const videos$ = useMemo(() => {
    if (!filters) {
      return null
    }
    return eventStore.timeline(filters).pipe(
      map(events => {
        return processEvents(events, relays, blockedPubkeys, config.blossomServers)
      })
    )
  }, [eventStore, filters, relays, blockedPubkeys, config.blossomServers])

  const videos = useObservableMemo(() => videos$ || null, [videos$]) || []

  // Load initial events from relays
  useEffect(() => {
    if (!filters || !pool || hasLoaded) return

    setLoading(true)
    const loader = createTimelineLoader(pool, relays, filters, {
      eventStore,
      limit,
      timeout,
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
        console.error('Error loading timeline:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, relays, eventStore, hasLoaded, limit, timeout])

  // Reset hasLoaded when reload dependency changes (e.g., tag or author changes)
  useEffect(() => {
    if (reloadDependency !== undefined) {
      setHasLoaded(false)
    }
  }, [reloadDependency])

  // Load more videos (pagination)
  const loadMore = useCallback(() => {
    if (!filters || !pool || loading) return

    setLoading(true)
    // Get the oldest event timestamp for pagination
    const oldestEvent = videos.length > 0 ? videos[videos.length - 1] : null
    const until = oldestEvent?.created_at

    const paginatedFilters = until ? { ...filters, until } : filters

    const loader = createTimelineLoader(pool, relays, paginatedFilters, {
      eventStore,
      limit,
      timeout,
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        setLoading(false)
      },
      error: err => {
        console.error('Error loading more timeline videos:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, relays, eventStore, loading, videos, limit, timeout])

  return {
    videos,
    loading,
    hasLoaded,
    loadMore,
  }
}

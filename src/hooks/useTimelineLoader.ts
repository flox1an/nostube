import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { cacheRequest } from '@/nostr/core'
import { processEvents, getPublishDate } from '@/utils/video-event'
import { useAppContext, useReportedPubkeys } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { of } from 'rxjs'
import { type NostrEvent, type Filter } from 'nostr-tools'
import type { VideoEvent } from '@/utils/video-event'

interface UseTimelineLoaderOptions {
  /**
   * Nostr filters for the timeline query
   */
  filters: Filter | null

  /**
   * Relays to query (should be stable reference)
   */
  relays: string[]

  /**
   * Optional dependency to trigger reload (e.g., tag, pubkey)
   * When this changes, the timeline will be reloaded
   */
  reloadDependency?: unknown

  /**
   * Optional limit for initial load (default: 50)
   */
  limit?: number
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
}: UseTimelineLoaderOptions): {
  videos: VideoEvent[]
  loading: boolean
  hasLoaded: boolean
  loadMore: () => void
} {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const { presetContent } = useSelectedPreset()
  const [loading, setLoading] = useState(true) // Start true to show skeletons instead of empty state
  const [hasLoaded, setHasLoaded] = useState(false)

  // Subscribe to events from EventStore for reactive updates
  // Only recreate observable when filters change, not when processing dependencies change
  const events =
    use$(() => {
      if (!filters) {
        return of([]) // Return observable that emits empty array
      }
      return eventStore.timeline(filters)
    }, [eventStore, filters]) ?? []

  // Process events separately so changes to relays/blockedPubkeys don't recreate the observable
  // Sort by publish date descending (newest first), fallback to created_at
  const videos = useMemo(() => {
    const processed = processEvents(
      events,
      relays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [events, relays, blockedPubkeys, config.blossomServers, presetContent.nsfwPubkeys])

  // Load initial events from relays
  useEffect(() => {
    if (!filters || !pool || hasLoaded) return

    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) {
        setLoading(true)
      }
    })()
    const loader = createTimelineLoader(pool, relays, filters, {
      eventStore,
      cache: cacheRequest, // Load from IndexedDB cache first
      limit,
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        if (cancelled) {
          return
        }
        setLoading(false)
        setHasLoaded(true)
      },
      error: err => {
        console.error('Error loading timeline:', err)
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
  }, [filters, pool, relays, eventStore, hasLoaded, limit])

  // Reset hasLoaded when reload dependency changes (e.g., tag or author changes)
  useEffect(() => {
    if (reloadDependency === undefined) {
      return
    }
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) {
        setLoading(true) // Show skeletons during reload
        setHasLoaded(false)
      }
    })()
    return () => {
      cancelled = true
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
      cache: cacheRequest, // Load from IndexedDB cache first
      limit,
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
  }, [filters, pool, relays, eventStore, loading, videos, limit])

  return {
    videos,
    loading,
    hasLoaded,
    loadMore,
  }
}

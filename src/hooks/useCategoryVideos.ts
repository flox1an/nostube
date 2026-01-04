import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAppContext } from './useAppContext'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents, type VideoEvent } from '@/utils/video-event'
import { useSelectedPreset } from './useSelectedPreset'
import { useReportedPubkeys } from './useReportedPubkeys'
import type { NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools/filter'
import { of } from 'rxjs'

interface UseCategoryVideosOptions {
  tags: string[] // All tags in the category
  relays: string[]
  videoKinds: number[]
  limit?: number // Optional limit for pagination (default: 50)
}

interface UseCategoryVideosResult {
  videos: VideoEvent[]
  loading: boolean
  exhausted: boolean
  loadMore: () => void
}

/**
 * Hook to load videos by category (OR query across multiple tags)
 *
 * Query strategy:
 * - Single filter with all category tags as OR query: { '#t': ['tag1', 'tag2', ...] }
 * - Simpler than useHashtagVideos (no NIP-32 label events)
 * - Relays handle OR semantics natively
 * - Uses use$ to subscribe to EventStore for reactive updates
 * - Supports infinite scroll pagination via loadMore
 */
export function useCategoryVideos({
  tags,
  relays,
  videoKinds,
  limit = 50,
}: UseCategoryVideosOptions): UseCategoryVideosResult {
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()

  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  // Track the count of videos before loading more to detect exhaustion
  const prevVideoCountRef = useRef(0)

  // Normalize tags to lowercase
  const normalizedTags = useMemo(() => tags.map(tag => tag.toLowerCase()), [tags])

  // Build filter for EventStore subscription
  const filters = useMemo((): Filter | null => {
    if (normalizedTags.length === 0) return null
    return {
      kinds: videoKinds,
      '#t': normalizedTags,
    }
  }, [videoKinds, normalizedTags])

  // Subscribe to EventStore for reactive updates as events arrive
  const events = use$(() => {
    if (!filters) return of([])
    return eventStore.timeline(filters)
  }, [eventStore, filters])

  // Process events separately so relay/blockedPubkeys changes don't recreate observable
  const videos = useMemo(() => {
    const eventList = events ?? []
    return processEvents(
      eventList,
      relays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )
  }, [events, relays, blockedPubkeys, config.blossomServers, presetContent.nsfwPubkeys])

  // Reset state when tags change to trigger reload
  useEffect(() => {
    queueMicrotask(() => {
      setHasLoaded(false)
      setLoading(true)
      setExhausted(false)
      prevVideoCountRef.current = 0
    })
  }, [normalizedTags])

  // Load initial events from relays into EventStore
  useEffect(() => {
    if (!pool || !relays || relays.length === 0 || !filters || hasLoaded) {
      if (!filters) queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))

    const loaderFilters: Filter[] = [{ ...filters, limit }]
    const loader = createTimelineLoader(pool, relays, loaderFilters, { eventStore })

    let eventCount = 0
    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
        eventCount++
      },
      complete: () => {
        setLoading(false)
        setHasLoaded(true)
        // If we got fewer events than the limit, we're exhausted
        if (eventCount < limit) {
          setExhausted(true)
        }
      },
      error: err => {
        console.error('Error loading category videos:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, relays, eventStore, hasLoaded, limit])

  // Load more videos (pagination)
  const loadMore = useCallback(() => {
    if (!filters || !pool || loading || exhausted || videos.length === 0) return

    setLoading(true)
    prevVideoCountRef.current = videos.length

    // Get the oldest event timestamp for pagination
    const oldestVideo = videos[videos.length - 1]
    const until = oldestVideo.created_at

    const paginatedFilters: Filter[] = [{ ...filters, until, limit }]
    const loader = createTimelineLoader(pool, relays, paginatedFilters, { eventStore })

    let eventCount = 0
    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
        eventCount++
      },
      complete: () => {
        setLoading(false)
        // If we got fewer events than the limit, we're exhausted
        if (eventCount < limit) {
          setExhausted(true)
        }
      },
      error: err => {
        console.error('Error loading more category videos:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, relays, eventStore, loading, exhausted, videos, limit])

  return {
    videos,
    loading,
    exhausted,
    loadMore,
  }
}

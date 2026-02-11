import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAppContext } from './useAppContext'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { getTimelineLoader } from '@/nostr/core'
import { processEvents, getPublishDate, type VideoEvent } from '@/utils/video-event'
import { useSelectedPreset } from './useSelectedPreset'
import { useReportedPubkeys } from './useReportedPubkeys'
import type { NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools/filter'
import { insertEventIntoDescendingList } from 'nostr-tools/utils'
import { of, type Subscription } from 'rxjs'

interface UseCategoryVideosOptions {
  tags: string[] // All tags in the category
  relays: string[]
  videoKinds: number[]
  limit?: number // Optional limit for pagination (default: 50)
  directMode?: boolean // When true, bypass EventStore and use loader events directly
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
 *
 * When directMode is true (e.g. single relay override):
 * - Skips EventStore cache and subscription
 * - Collects events directly from the loader into local state
 * - Ensures only events from the specified relays are shown
 */
export function useCategoryVideos({
  tags,
  relays,
  videoKinds,
  limit = 50,
  directMode = false,
}: UseCategoryVideosOptions): UseCategoryVideosResult {
  const { config } = useAppContext()
  const eventStore = useEventStore()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()

  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [exhausted, setExhausted] = useState(false)

  // Local event state for directMode (bypass EventStore)
  const [directEvents, setDirectEvents] = useState<NostrEvent[]>([])

  // Track the count of videos before loading more to detect exhaustion
  const prevVideoCountRef = useRef(0)
  // Store subscription ref to keep it alive during loadMore
  const loadMoreSubscriptionRef = useRef<Subscription | null>(null)

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

  // Subscribe to EventStore for reactive updates as events arrive (normal mode only)
  const storeEvents = use$(() => {
    if (directMode || !filters) return of([])
    return eventStore.timeline(filters)
  }, [eventStore, filters, directMode])

  // Use store events in normal mode, direct events in direct mode
  const events = directMode ? directEvents : storeEvents

  // Process events separately so relay/blockedPubkeys changes don't recreate observable
  // Sort by publish date descending (newest first), fallback to created_at
  const videos = useMemo(() => {
    const eventList = events ?? []
    const processed = processEvents(
      eventList,
      relays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [events, relays, blockedPubkeys, config.blossomServers, presetContent.nsfwPubkeys])

  // Reset state when tags or relays change to trigger reload
  useEffect(() => {
    queueMicrotask(() => {
      setHasLoaded(false)
      setLoading(true)
      setExhausted(false)
      setDirectEvents([])
      prevVideoCountRef.current = 0
    })
  }, [normalizedTags, relays, directMode])

  // Load initial events from relays into EventStore
  useEffect(() => {
    if (!relays || relays.length === 0 || !filters || hasLoaded) {
      if (!filters) queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))

    // Create unique cache key for this category filter
    const cacheKey = `category:${normalizedTags.sort().join(',')}:r:${relays.sort().join(',')}`
    const loader = getTimelineLoader(
      cacheKey,
      filters,
      relays,
      directMode ? { skipCache: true } : undefined
    )

    let eventCount = 0
    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        if (directMode) {
          setDirectEvents(prev => Array.from(insertEventIntoDescendingList(prev, event)))
        } else {
          eventStore.add(event)
        }
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
  }, [filters, relays, eventStore, hasLoaded, limit, normalizedTags, directMode])

  // Cleanup loadMore subscription on unmount
  useEffect(() => {
    return () => {
      loadMoreSubscriptionRef.current?.unsubscribe()
    }
  }, [])

  // Load more videos (pagination)
  const loadMore = useCallback(() => {
    if (!filters || loading || exhausted || videos.length === 0) return

    // Clean up any previous loadMore subscription
    loadMoreSubscriptionRef.current?.unsubscribe()

    setLoading(true)
    prevVideoCountRef.current = videos.length

    // Get the oldest event timestamp for pagination
    const oldestVideo = videos[videos.length - 1]
    const until = oldestVideo.created_at

    const paginatedFilter = { ...filters, until }
    // Create unique cache key for paginated request
    const cacheKey = `category:${normalizedTags.sort().join(',')}:r:${relays.sort().join(',')}:until:${until}`
    const loader = getTimelineLoader(
      cacheKey,
      paginatedFilter,
      relays,
      directMode ? { skipCache: true } : undefined
    )

    let eventCount = 0
    loadMoreSubscriptionRef.current = loader().subscribe({
      next: (event: NostrEvent) => {
        if (directMode) {
          setDirectEvents(prev => Array.from(insertEventIntoDescendingList(prev, event)))
        } else {
          eventStore.add(event)
        }
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
  }, [filters, relays, eventStore, loading, exhausted, videos, limit, normalizedTags, directMode])

  return {
    videos,
    loading,
    exhausted,
    loadMore,
  }
}

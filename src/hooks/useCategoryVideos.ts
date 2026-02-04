import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAppContext } from './useAppContext'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { getTimelineLoader } from '@/nostr/core'
import { processEvents, getPublishDate, type VideoEvent } from '@/utils/video-event'
import { useSelectedPreset } from './useSelectedPreset'
import { useReportedPubkeys } from './useReportedPubkeys'
import type { NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools/filter'
import { of, type Subscription } from 'rxjs'

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
  const { config } = useAppContext()
  const eventStore = useEventStore()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()

  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [exhausted, setExhausted] = useState(false)

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

  // Subscribe to EventStore for reactive updates as events arrive
  const events = use$(() => {
    if (!filters) return of([])
    return eventStore.timeline(filters)
  }, [eventStore, filters])

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
    if (!relays || relays.length === 0 || !filters || hasLoaded) {
      if (!filters) queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))

    // Create unique cache key for this category filter
    const cacheKey = `category:${normalizedTags.sort().join(',')}`
    const loader = getTimelineLoader(cacheKey, filters, relays)

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
  }, [filters, relays, eventStore, hasLoaded, limit, normalizedTags])

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
    const cacheKey = `category:${normalizedTags.sort().join(',')}:until:${until}`
    const loader = getTimelineLoader(cacheKey, paginatedFilter, relays)

    let eventCount = 0
    loadMoreSubscriptionRef.current = loader().subscribe({
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
  }, [filters, relays, eventStore, loading, exhausted, videos, limit, normalizedTags])

  return {
    videos,
    loading,
    exhausted,
    loadMore,
  }
}

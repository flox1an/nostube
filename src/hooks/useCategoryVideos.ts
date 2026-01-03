import { useState, useEffect, useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvent, deduplicateByIdentifier, type VideoEvent } from '@/utils/video-event'
import { useSelectedPreset } from './useSelectedPreset'
import type { NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools/filter'

interface UseCategoryVideosOptions {
  tags: string[] // All tags in the category
  relays: string[]
  videoKinds: number[]
}

interface UseCategoryVideosResult {
  videos: VideoEvent[]
  loading: boolean
  loadMore: () => void
}

/**
 * Hook to load videos by category (OR query across multiple tags)
 *
 * Query strategy:
 * - Single filter with all category tags as OR query: { '#t': ['tag1', 'tag2', ...] }
 * - Simpler than useHashtagVideos (no NIP-32 label events)
 * - Relays handle OR semantics natively
 */
export function useCategoryVideos({
  tags,
  relays,
  videoKinds,
}: UseCategoryVideosOptions): UseCategoryVideosResult {
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const { presetContent } = useSelectedPreset()

  const [videos, setVideos] = useState<VideoEvent[]>([])
  const [loading, setLoading] = useState(true)

  // Normalize tags to lowercase
  const normalizedTags = useMemo(() => tags.map(tag => tag.toLowerCase()), [tags])

  // Reset state when tags change
  useEffect(() => {
    queueMicrotask(() => {
      setVideos([])
      setLoading(true)
    })
  }, [normalizedTags])

  // Query videos with OR filter across all category tags
  useEffect(() => {
    if (!pool || !relays || relays.length === 0 || normalizedTags.length === 0) {
      queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))
    const processedVideos: VideoEvent[] = []

    const filters: Filter[] = [
      {
        kinds: videoKinds,
        '#t': normalizedTags, // OR query across all tags
        limit: 50,
      },
    ]

    const loader = createTimelineLoader(pool, relays, filters, { eventStore })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        const processed = processEvent(event, [], config.blossomServers, presetContent.nsfwPubkeys)
        if (processed) {
          processedVideos.push(processed)
        }
      },
      error: err => {
        console.error('Error loading category videos:', err)
        queueMicrotask(() => setLoading(false))
      },
    })

    // Wait for initial batch to load
    const timeout = setTimeout(() => {
      // Deduplicate videos (same video posted as both addressable and regular events)
      setVideos(deduplicateByIdentifier(processedVideos))
      queueMicrotask(() => setLoading(false))
    }, 2000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [
    normalizedTags,
    pool,
    relays,
    videoKinds,
    eventStore,
    config.blossomServers,
    presetContent.nsfwPubkeys,
  ])

  // Load more function (currently no-op, can be extended for pagination)
  const loadMore = () => {
    // Future: Implement pagination
  }

  return {
    videos,
    loading,
    loadMore,
  }
}

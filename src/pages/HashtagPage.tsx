import { useParams } from 'react-router-dom'
import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { useInfiniteScroll, useReadRelays, useAppContext, useReportedPubkeys } from '@/hooks'
import { useMemo, useEffect, useState, useCallback } from 'react'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { getKindsForType } from '@/lib/video-types'
import { processEvents } from '@/utils/video-event'
import { map } from 'rxjs'
import { NostrEvent } from 'nostr-tools'

export function HashtagPage() {
  const { tag } = useParams<{ tag: string }>()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const readRelays = useReadRelays()

  // Create filter for hashtag
  const filters = useMemo(() => {
    if (!tag) {
      return null
    }
    return {
      kinds: getKindsForType('all'),
      '#t': [tag.toLowerCase()], // Hashtags are typically lowercase in Nostr
    }
  }, [tag])

  // Subscribe to events from EventStore
  const videos$ = useMemo(() => {
    if (!filters) {
      return null
    }
    return eventStore.timeline(filters).pipe(
      map(events => {
        return processEvents(events, readRelays, blockedPubkeys, config.blossomServers)
      })
    )
  }, [eventStore, filters, readRelays, blockedPubkeys, config.blossomServers])

  const videos = useObservableMemo(() => videos$ || null, [videos$]) || []

  // Load initial events from relays
  useEffect(() => {
    if (!filters || !pool || hasLoaded) return

    setLoading(true)
    const loader = createTimelineLoader(pool, readRelays, filters, {
      eventStore,
      limit: 50,
      timeout: 5000, // 5 second timeout per relay to prevent blocking
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
        console.error('Error loading hashtag videos:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, readRelays, eventStore, hasLoaded])

  // Reset hasLoaded when tag changes
  useEffect(() => {
    setHasLoaded(false)
  }, [tag])

  const loadMore = useCallback(() => {
    if (!filters || !pool || loading) return () => {}

    setLoading(true)
    // Get the oldest event timestamp for pagination
    const oldestEvent = videos.length > 0 ? videos[videos.length - 1] : null
    const until = oldestEvent?.created_at

    const paginatedFilters = until ? { ...filters, until } : filters

    const loader = createTimelineLoader(pool, readRelays, paginatedFilters, {
      eventStore,
      limit: 50,
      timeout: 5000, // 5 second timeout per relay to prevent blocking
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        setLoading(false)
      },
      error: err => {
        console.error('Error loading more hashtag videos:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, readRelays, eventStore, loading, videos])

  const { ref } = useInfiniteScroll({
    onLoadMore: loadMore,
    loading,
    exhausted: false,
  })

  const isLoadingInitial = loading && videos.length === 0
  const isLoadingMore = loading && videos.length > 0

  // Update document title
  useEffect(() => {
    if (tag) {
      document.title = `#${tag} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [tag])

  return (
    <div className="sm:p-4">
      <div className="p-2">
        <h1 className="text-2xl font-bold mb-4">#{tag}</h1>
      </div>

      <VideoGrid
        videos={videos}
        isLoading={isLoadingInitial}
        showSkeletons={true}
        layoutMode="auto"
      />

      <InfiniteScrollTrigger
        triggerRef={ref}
        loading={isLoadingMore}
        exhausted={false}
        itemCount={videos.length}
        emptyMessage={`No videos found with hashtag #${tag}.`}
        loadingMessage="Loading more videos..."
        exhaustedMessage=""
      />
    </div>
  )
}

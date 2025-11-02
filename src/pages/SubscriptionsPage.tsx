import { VideoGrid } from '@/components/VideoGrid'
import { Loader2 } from 'lucide-react'
import { useFollowedAuthors } from '@/hooks/useFollowedAuthors'
import { useInView } from 'react-intersection-observer'
import { useMemo, useEffect, useState, useCallback } from 'react'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { getKindsForType } from '@/lib/video-types'
import { processEvents } from '@/utils/video-event'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { map } from 'rxjs'
import { NostrEvent } from 'nostr-tools'

export function SubscriptionsPage() {
  const { data: followedProfiles = [] } = useFollowedAuthors()
  const followedPubkeys = useMemo(
    () => followedProfiles.map(profile => profile.pubkey),
    [followedProfiles]
  )

  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const readRelays = useMemo(() => {
    return config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
  }, [config.relays])

  // Create filter for all followed authors
  const filters = useMemo(() => {
    if (followedPubkeys.length === 0) {
      return null
    }
    return {
      kinds: getKindsForType('all'),
      authors: followedPubkeys,
    }
  }, [followedPubkeys])

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
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        setLoading(false)
        setHasLoaded(true)
      },
      error: (err) => {
        console.error('Error loading subscriptions:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, readRelays, eventStore, hasLoaded])

  // Reset hasLoaded when followed authors change
  useEffect(() => {
    setHasLoaded(false)
  }, [followedPubkeys])

  // Intersection observer for infinite loading (load more pages)
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  })

  const loadMore = useCallback(() => {
    if (!filters || !pool || loading) return () => {}

    setLoading(true)
    // Get the oldest event timestamp for pagination
    const oldestEvent = videos.length > 0 ? videos[videos.length - 1] : null
    const until = oldestEvent?.created_at

    const paginatedFilters = until
      ? { ...filters, until }
      : filters

    const loader = createTimelineLoader(pool, readRelays, paginatedFilters, {
      eventStore,
      limit: 50,
    })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
      },
      complete: () => {
        setLoading(false)
      },
      error: (err) => {
        console.error('Error loading more subscriptions:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, readRelays, eventStore, loading, videos])

  // Trigger load more when in view
  useEffect(() => {
    if (inView && !loading && videos.length > 0) {
      const cleanup = loadMore()
      return cleanup
    }
  }, [inView, loading, videos.length, loadMore])

  const isLoadingInitial = loading && videos.length === 0
  const isLoadingMore = loading && videos.length > 0

  return (
    <div className="sm:p-4">
      <VideoGrid
        videos={videos}
        isLoading={isLoadingInitial}
        showSkeletons={true}
        layoutMode="auto"
      />

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more videos...
          </div>
        )}
        {followedPubkeys.length === 0 && (
          <div className="text-muted-foreground">Follow some authors to see their videos here.</div>
        )}
        {videos.length === 0 && !loading && followedPubkeys.length > 0 && (
          <div className="text-muted-foreground">No videos found from your subscriptions.</div>
        )}
      </div>
    </div>
  )
}

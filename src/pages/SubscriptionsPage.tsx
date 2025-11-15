import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import {
  useFollowedAuthors,
  useStableRelays,
  useAppContext,
  useReportedPubkeys,
} from '@/hooks'
import { useMemo, useEffect, useState, useCallback } from 'react'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { getKindsForType } from '@/lib/video-types'
import { processEvents } from '@/utils/video-event'
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

  const readRelays = useStableRelays()

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
        console.error('Error loading more subscriptions:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [filters, pool, readRelays, eventStore, loading, videos])

  return (
    <VideoTimelinePage
      videos={videos}
      loading={loading}
      exhausted={false}
      onLoadMore={loadMore}
      layoutMode="auto"
      emptyMessage={
        followedPubkeys.length === 0
          ? 'Follow some authors to see their videos here.'
          : 'No videos found from your subscriptions.'
      }
      exhaustedMessage=""
      className="sm:p-4"
    />
  )
}

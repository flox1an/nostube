import { useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useReadRelays } from '@/hooks/useReadRelays'
import { useFollowSetContext } from '@/contexts/FollowSetContext'
import { getKindsForType } from '@nostube/core/video-types'
import { useInfiniteTimeline } from '@nostube/widgets/hooks/useInfiniteTimeline'
import { client } from '@/nostr/core'
import { createSubscriptionsLoader } from '@nostube/core/subscriptions-loader'
import { INDEXER_RELAYS, METADATA_RELAYS } from '@/constants/relays'
import { getInstanceConfig } from '@nostube/core/instance-config'
import { getPublishDate } from '@nostube/core/video-event'
import type { VideoEvent } from '@nostube/core/video-event'

/**
 * Shared subscriptions timeline: long-form + shorts from followed authors,
 * deduped to at most one long-form and one short per author per day.
 * Used by the full Subscriptions page and the Home "From creators you follow" shelf.
 */
export function useSubscriptionsVideos() {
  // Optimistic: falls back to the cached list so the timeline filter exists
  // before the live kind 10020 lands.
  const { optimisticFollowedPubkeys, followSetEvent } = useFollowSetContext()
  const followedPubkeys = optimisticFollowedPubkeys

  const relays = useReadRelays()
  const { config } = useAppContext()

  // Stable key based on sorted pubkeys — only recreate loader when actual follows change
  const pubkeysKey = useMemo(() => [...followedPubkeys].sort().join(','), [followedPubkeys])

  const discoveryRelays = useMemo(
    () => [...relays, ...METADATA_RELAYS, ...INDEXER_RELAYS],
    [relays]
  )
  const relayHints = useMemo(() => {
    const hints: Record<string, string[]> = {}
    for (const [tag, pubkey, relay] of followSetEvent?.tags ?? []) {
      if (tag === 'p' && relay) (hints[pubkey] ??= []).push(relay)
    }
    return hints
  }, [followSetEvent])
  const loader = useMemo(() => {
    if (!pubkeysKey) return undefined
    const authors = pubkeysKey.split(',')
    const timeline = getInstanceConfig()
      ? client.getTimelineLoader(
          'subscriptions',
          { kinds: getKindsForType('all'), authors },
          relays
        )
      : createSubscriptionsLoader(client, authors, relays, discoveryRelays, relayHints)
    return () => timeline
  }, [pubkeysKey, relays, discoveryRelays, relayHints])

  const filters = useMemo(
    () =>
      pubkeysKey ? { kinds: getKindsForType('all'), authors: pubkeysKey.split(',') } : undefined,
    [pubkeysKey]
  )
  const {
    videos,
    loading,
    exhausted,
    isPrefetching: prefetching,
    subscriptionActive,
    phase,
    loadMore,
    prefetchMore,
  } = useInfiniteTimeline(loader, relays, { filters })
  const error = phase === 'error'

  // Show at most one long-form and one short per pubkey per day (videos are already sorted newest-first)
  const dedupedVideos = useMemo(() => {
    const seenLongform = new Set<string>()
    const seenShorts = new Set<string>()
    const result: VideoEvent[] = []
    for (const video of videos) {
      const day = new Date(getPublishDate(video) * 1000).toISOString().slice(0, 10)
      const key = `${video.pubkey}:${day}`
      if (video.type === 'videos') {
        if (!seenLongform.has(key)) {
          seenLongform.add(key)
          result.push(video)
        }
      } else if (video.type === 'shorts') {
        if (!seenShorts.has(key)) {
          seenShorts.add(key)
          result.push(video)
        }
      }
    }
    // Re-sort by publish date since we interleaved two sets
    const sorted = result.sort((a, b) => getPublishDate(b) - getPublishDate(a))
    return (config.nsfwFilter ?? 'hide') === 'hide'
      ? sorted.filter(video => !video.contentWarning)
      : sorted
  }, [videos, config.nsfwFilter])

  return {
    followedPubkeys,
    videos: dedupedVideos,
    loading,
    exhausted,
    prefetching,
    subscriptionActive,
    error,
    loadMore,
    prefetchMore,
  }
}

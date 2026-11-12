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
import { applyDailyGrouping } from '@/lib/daily-grouping'
import { useGroupPerDay } from '@/hooks/useGroupPerDay'

/**
 * Shared subscriptions timeline: long-form + shorts from followed authors, grouped to at most
 * one long-form and one short per author per day unless the user turned grouping off.
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

  const [grouped] = useGroupPerDay()
  const dedupedVideos = useMemo(() => {
    const sorted = applyDailyGrouping(videos, grouped)
    return (config.nsfwFilter ?? 'hide') === 'hide'
      ? sorted.filter(video => !video.contentWarning)
      : sorted
  }, [videos, grouped, config.nsfwFilter])

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

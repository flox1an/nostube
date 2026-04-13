import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useFollowedAuthors, useStableRelays } from '@/hooks'
import { useMemo, useEffect } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { getTimelineLoader } from '@/nostr/core'
import { getPublishDate } from '@/utils/video-event'
import type { VideoEvent } from '@/utils/video-event'

export function SubscriptionsPage() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = `${t('navigation.subscriptions')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  const { data: followedProfiles = [] } = useFollowedAuthors()
  const followedPubkeys = useMemo(
    () => followedProfiles.map(profile => profile.pubkey),
    [followedProfiles]
  )

  const relays = useStableRelays()

  // Stable key based on sorted pubkeys — only recreate loader when actual follows change
  const pubkeysKey = useMemo(() => [...followedPubkeys].sort().join(','), [followedPubkeys])

  const loader = useMemo(() => {
    if (followedPubkeys.length === 0) return undefined
    const timelineLoader = getTimelineLoader(
      `subscriptions:${pubkeysKey}`,
      { kinds: getKindsForType('all'), authors: followedPubkeys },
      relays
    )
    return () => timelineLoader
    // pubkeysKey captures followedPubkeys changes; relays is separately tracked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeysKey, relays])

  const { videos, loading, exhausted, subscriptionActive, loadMore } = useInfiniteTimeline(
    loader,
    relays
  )

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
    return result.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [videos])

  return (
    <div className="max-w-560 mx-auto">
      <VideoTimelinePage
        videos={dedupedVideos}
        loading={loading}
        exhausted={exhausted}
        subscriptionActive={subscriptionActive}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={
          followedPubkeys.length === 0
            ? t('pages.subscriptions.emptyState')
            : t('pages.subscriptions.noVideos')
        }
        exhaustedMessage={t('pages.subscriptions.noMore')}
        className="sm:p-4"
      />
    </div>
  )
}

import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useFollowedAuthors, useStableRelays } from '@/hooks'
import { useMemo, useEffect } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { getTimelineLoader } from '@/nostr/core'

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

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  return (
    <div className="max-w-560 mx-auto">
      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={exhausted}
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

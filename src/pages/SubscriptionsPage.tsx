import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useFollowedAuthors, useStableRelays, useTimelineLoader } from '@/hooks'
import { useMemo } from 'react'
import { getKindsForType } from '@/lib/video-types'

export function SubscriptionsPage() {
  const { data: followedProfiles = [] } = useFollowedAuthors()
  const followedPubkeys = useMemo(
    () => followedProfiles.map(profile => profile.pubkey),
    [followedProfiles]
  )

  const relays = useStableRelays()

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

  const { videos, loading, loadMore } = useTimelineLoader({
    filters,
    relays,
    reloadDependency: followedPubkeys.join(','),
  })

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

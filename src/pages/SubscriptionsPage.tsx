import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useFollowedAuthors, useStableRelays, useTimelineLoader } from '@/hooks'
import { useMemo, useEffect } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'

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
    <div className="max-w-560 mx-auto">
      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={false}
        onLoadMore={loadMore}
        layoutMode="auto"
        emptyMessage={
          followedPubkeys.length === 0
            ? t('pages.subscriptions.emptyState')
            : t('pages.subscriptions.noVideos')
        }
        exhaustedMessage=""
        className="sm:p-4"
      />
    </div>
  )
}

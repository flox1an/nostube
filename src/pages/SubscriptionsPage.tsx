import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useFollowedAuthors, useStableRelays } from '@/hooks'
import { useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { getKindsForType } from '@/lib/video-types'
import { useTranslation } from 'react-i18next'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { getTimelineLoader } from '@/nostr/core'
import { getPublishDate } from '@/utils/video-event'
import type { VideoEvent } from '@/utils/video-event'

export function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

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

  const videosLoader = useMemo(() => {
    if (followedPubkeys.length === 0) return undefined
    const timelineLoader = getTimelineLoader(
      `subscriptions:videos:${pubkeysKey}`,
      { kinds: getKindsForType('videos'), authors: followedPubkeys },
      relays
    )
    return () => timelineLoader
    // pubkeysKey captures followedPubkeys changes; relays is separately tracked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeysKey, relays])

  const shortsLoader = useMemo(() => {
    if (followedPubkeys.length === 0) return undefined
    const timelineLoader = getTimelineLoader(
      `subscriptions:shorts:${pubkeysKey}`,
      { kinds: getKindsForType('shorts'), authors: followedPubkeys },
      relays
    )
    return () => timelineLoader
    // pubkeysKey captures followedPubkeys changes; relays is separately tracked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeysKey, relays])

  const videosFilter = useMemo(() => {
    if (followedPubkeys.length === 0) return undefined
    return { kinds: getKindsForType('videos'), authors: followedPubkeys }
    // pubkeysKey captures followedPubkeys changes with stable ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeysKey])

  const shortsFilter = useMemo(() => {
    if (followedPubkeys.length === 0) return undefined
    return { kinds: getKindsForType('shorts'), authors: followedPubkeys }
    // pubkeysKey captures followedPubkeys changes with stable ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeysKey])

  const {
    videos: horizontalVideos,
    loading: loadingVideos,
    exhausted: exhaustedVideos,
    loadMore: loadMoreVideos,
    prefetchMore: prefetchMoreVideos,
    isPrefetching: prefetchingVideos,
    subscriptionActive: subscriptionActiveVideos,
  } = useInfiniteTimeline(videosLoader, relays, {
    filters: videosFilter,
  })

  const {
    videos: verticalVideos,
    loading: loadingShorts,
    exhausted: exhaustedShorts,
    loadMore: loadMoreShorts,
    prefetchMore: prefetchMoreShorts,
    isPrefetching: prefetchingShorts,
    subscriptionActive: subscriptionActiveShorts,
  } = useInfiniteTimeline(shortsLoader, relays, {
    filters: shortsFilter,
  })

  const videos = useMemo(
    () =>
      [...horizontalVideos, ...verticalVideos].sort(
        (a, b) => getPublishDate(b) - getPublishDate(a)
      ),
    [horizontalVideos, verticalVideos]
  )

  const loading = loadingVideos || loadingShorts
  const exhausted = exhaustedVideos && exhaustedShorts
  const prefetching = prefetchingVideos || prefetchingShorts
  const subscriptionActive = subscriptionActiveVideos || subscriptionActiveShorts

  const loadMore = useCallback(() => {
    loadMoreVideos()
    loadMoreShorts()
  }, [loadMoreVideos, loadMoreShorts])

  const prefetchMore = useCallback(() => {
    prefetchMoreVideos()
    prefetchMoreShorts()
  }, [prefetchMoreShorts, prefetchMoreVideos])

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

  if (followedPubkeys.length === 0) {
    return (
      <div className="max-w-560 mx-auto sm:p-4">
        <div className="rounded-xl border p-8 text-center space-y-3">
          <h2 className="text-xl font-semibold">{t('pages.subscriptions.welcomeTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('pages.subscriptions.welcomeDescription')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => navigate('/explore')}>
              {t('pages.subscriptions.exploreButton')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/search')}>
              {t('pages.subscriptions.findCreators')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto">
      <VideoTimelinePage
        videos={dedupedVideos}
        loading={loading}
        exhausted={exhausted}
        prefetching={prefetching}
        subscriptionActive={subscriptionActive}
        onLoadMore={loadMore}
        onPrefetch={prefetchMore}
        layoutMode="auto"
        emptyMessage={t('pages.subscriptions.noVideos')}
        exhaustedMessage={t('pages.subscriptions.noMore')}
        className="sm:p-4"
      />
    </div>
  )
}

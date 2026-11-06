import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { RelaySourcePicker } from '@/components/RelaySourcePicker'
import { VideoCard } from '@/components/VideoCard'
import { Button } from '@nostube/widgets/components/button'
import { Link } from 'react-router-dom'
import { useInfiniteTimeline } from '@nostube/widgets/hooks/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useReadRelays, useContinueWatching, useSubscriptionsVideos } from '@/hooks'
import { useRelayBrowsing } from '@/contexts/RelayBrowsingContext'
import { RelayBrowseStatus } from '@/components/RelayBrowseStatus'
import { useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getPublishDate } from '@nostube/core/video-event'
import type { VideoEvent } from '@nostube/core/video-event'
import { useTrustFilter } from '@/hooks/useTrustFilter'
import { getKindsForType } from '@nostube/core/video-types'
import { appTitle, pageTitle } from '@nostube/core/instance-config'

/** Compact horizontal shelf of videos with a heading and "View all" link. Hidden when empty. */
function HomeShelf({
  title,
  viewAllTo,
  videos,
}: {
  title: string
  viewAllTo: string
  videos: VideoEvent[]
}) {
  const { t } = useTranslation()
  if (videos.length === 0) return null
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1 sm:px-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Button
          variant="ghost"
          size="sm"
          className="relative after:absolute after:inset-x-0 after:-inset-y-1"
          asChild
        >
          <Link to={viewAllTo}>{t('common.viewAll', 'View all')}</Link>
        </Button>
      </div>
      {/* Bleeds to the screen edge on mobile so the next card peeks. */}
      <div className="-mx-3 overflow-x-auto scrollbar-hide px-3 sm:mx-0 sm:px-0">
        <div className="flex gap-2 min-w-max">
          {videos.map(video => (
            <div key={video.id} className="video-shelf-item shrink-0">
              <VideoCard
                video={video}
                format="horizontal"
                containThumbnail={video.type === 'shorts'}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  const { source } = useRelayBrowsing()

  useEffect(() => {
    document.title = pageTitle(`${t('navigation.home')}`)
    return () => {
      document.title = appTitle()
    }
  }, [t])
  const relays = useReadRelays()

  const effectiveRelays = source?.relays ?? relays

  const effectiveRelaysRef = useRef(effectiveRelays)
  effectiveRelaysRef.current = effectiveRelays

  const loader = useMemo(
    () =>
      videoTypeLoader(
        'videos',
        source ? source.relays : effectiveRelaysRef.current,
        source ? { skipCache: true } : undefined
      ),
    // Keep the default feed stable while account metadata loads.
    [source]
  )

  const timelineFilter = useMemo(() => ({ kinds: getKindsForType('videos') }), [])

  const {
    videos,
    loading,
    exhausted,
    loadMore,
    prefetchMore,
    isPrefetching,
    subscriptionActive,
    phase,
  } = useInfiniteTimeline(loader, effectiveRelays, {
    filters: timelineFilter,
    directMode: !!source,
  })

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
    return result.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [videos])

  const { filteredVideos, filterButton, pending: trustPending } = useTrustFilter(dedupedVideos)
  const { videos: continueWatchingVideos } = useContinueWatching()
  const { videos: subscriptionsVideos } = useSubscriptionsVideos()

  if (!filteredVideos) return null

  return (
    <div className="mx-auto max-w-560 px-3 sm:px-2">
      <div className="-mx-3 sm:mx-0">
        <CategoryButtonBar />
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 px-1 sm:px-2">
        <h1 className="sr-only text-2xl font-semibold tracking-tight sm:not-sr-only sm:mr-auto">
          {t('pages.home.latestVideos')}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <RelaySourcePicker />
          {filterButton}
        </div>
      </div>
      <RelayBrowseStatus />
      {!source && (
        <HomeShelf
          title={t('pages.home.continueWatching', 'Continue watching')}
          viewAllTo="/history"
          videos={continueWatchingVideos}
        />
      )}
      {!source && (
        <HomeShelf
          title={t('pages.home.fromSubscriptions', 'From creators you follow')}
          viewAllTo="/subscriptions"
          videos={subscriptionsVideos.slice(0, 12)}
        />
      )}
      {(!source || source.relays.length > 0) && (
        <div className="-mx-3 sm:mx-0">
          <VideoTimelinePage
            videos={filteredVideos}
            loading={loading || trustPending}
            exhausted={exhausted}
            prefetching={isPrefetching}
            subscriptionActive={subscriptionActive}
            onLoadMore={loadMore}
            onPrefetch={prefetchMore}
            layoutMode="horizontal"
            emptyMessage={t('pages.home.noVideos')}
            exhaustedMessage={t('pages.home.noMore')}
            error={phase === 'error'}
            className=""
            fullBleed
          />
        </div>
      )}
    </div>
  )
}

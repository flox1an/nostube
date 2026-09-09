import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { VideoCard } from '@/components/VideoCard'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays, useContinueWatching, useSubscriptionsVideos } from '@/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getPublishDate } from '@/utils/video-event'
import type { VideoEvent } from '@/utils/video-event'
import { useTrustFilter } from '@/hooks/useTrustFilter'
import { getKindsForType } from '@/lib/video-types'

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
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to={viewAllTo}>{t('common.viewAll', 'View all')}</Link>
        </Button>
      </div>
      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          {videos.map(video => (
            <div key={video.id} className="w-72 shrink-0">
              <VideoCard
                video={video}
                format={video.type === 'shorts' ? 'vertical' : 'horizontal'}
                treatment="quiet-cinema"
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
  const { relayOverride, setRelayOverride } = useAppContext()

  useEffect(() => {
    document.title = `${t('navigation.home')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])
  const relays = useStableRelays()

  const effectiveRelays = useMemo(
    () => (relayOverride ? [relayOverride] : relays),
    [relayOverride, relays]
  )

  // Keep current effectiveRelays in a ref so the loader useMemo doesn't need
  // it as a dep. This prevents a timeline reset when the user's NIP-65 relay
  // list loads asynchronously after mount (UserRelaySync) — which would
  // otherwise cause a visible double-load on every hard page refresh.
  const effectiveRelaysRef = useRef(effectiveRelays)
  effectiveRelaysRef.current = effectiveRelays

  const loader = useMemo(
    () =>
      videoTypeLoader(
        'videos',
        relayOverride ? [relayOverride] : effectiveRelaysRef.current,
        relayOverride ? { skipCache: true } : undefined
      ),
    // effectiveRelaysRef.current intentionally excluded: relay additions from
    // NIP-65 sync after mount must not reset an in-progress timeline load.
    [relayOverride]
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
    directMode: !!relayOverride,
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

  const { filteredVideos, filterButton } = useTrustFilter(dedupedVideos)
  const { videos: continueWatchingVideos } = useContinueWatching()
  const { videos: subscriptionsVideos } = useSubscriptionsVideos()

  if (!filteredVideos) return null

  return (
    <div className="mx-auto max-w-560 px-3 sm:px-4 lg:px-6">
      <div className="-mx-3 sm:-mx-4 lg:-mx-6">
        <CategoryButtonBar
          selectedRelay={relayOverride}
          onRelayChange={setRelayOverride}
          afterRelay={filterButton}
          tone="quiet"
        />
      </div>
      <HomeShelf
        title={t('pages.home.continueWatching', 'Continue watching')}
        viewAllTo="/history"
        videos={continueWatchingVideos}
      />
      <HomeShelf
        title={t('pages.home.fromSubscriptions', 'From creators you follow')}
        viewAllTo="/subscriptions"
        videos={subscriptionsVideos.slice(0, 12)}
      />
      <div className="mb-4 flex items-baseline justify-between px-1 pt-5 sm:mb-5 sm:pt-7">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('pages.home.latestVideos')}
        </h1>
        <span className="text-sm text-muted-foreground">{t('pages.home.newestFirst')}</span>
      </div>
      <VideoTimelinePage
        videos={filteredVideos}
        loading={loading}
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
        cardTreatment="quiet-cinema"
      />
    </div>
  )
}

import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { RelaySourcePicker } from '@/components/RelaySourcePicker'
import { useInfiniteTimeline } from '@nostube/widgets/hooks/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useReadRelays } from '@/hooks'
import { useRelayBrowsing } from '@/contexts/RelayBrowsingContext'
import { RelayBrowseStatus } from '@/components/RelayBrowseStatus'
import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustFilter } from '@/hooks/useTrustFilter'
import { getKindsForType } from '@nostube/core/video-types'
import { appTitle, pageTitle } from '@nostube/core/instance-config'

export function ShortsPage() {
  const { t } = useTranslation()
  const { source } = useRelayBrowsing()

  useEffect(() => {
    document.title = pageTitle(`${t('navigation.shorts')}`)
    return () => {
      document.title = appTitle()
    }
  }, [t])
  const relays = useReadRelays()

  const effectiveRelays = source?.relays ?? relays

  // Memoize the loader to prevent recreation on every render
  // When relay override is active, skip EventStore cache to show only that relay's events
  const loader = useMemo(
    () => videoTypeLoader('shorts', effectiveRelays, source ? { skipCache: true } : undefined),
    [effectiveRelays, source]
  )

  const timelineFilter = useMemo(() => ({ kinds: getKindsForType('shorts') }), [])

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
  const { filteredVideos, filterButton, pending: trustPending } = useTrustFilter(videos)

  return (
    <div className="max-w-560 mx-auto">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 px-4">
        <h1 className="sr-only text-2xl font-semibold tracking-tight sm:not-sr-only sm:mr-auto">
          {t('navigation.shorts')}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <RelaySourcePicker />
          {filterButton}
        </div>
      </div>
      <RelayBrowseStatus />
      {(!source || source.relays.length > 0) && (
        <VideoTimelinePage
          videos={filteredVideos ?? []}
          loading={loading || trustPending}
          exhausted={exhausted}
          prefetching={isPrefetching}
          subscriptionActive={subscriptionActive}
          onLoadMore={loadMore}
          onPrefetch={prefetchMore}
          layoutMode="vertical"
          emptyMessage={t('pages.shorts.noShorts')}
          loadingMessage={t('pages.shorts.loadingMore')}
          exhaustedMessage={t('pages.shorts.noMore')}
          error={phase === 'error'}
          className="sm:px-2"
          fullBleed
        />
      )}
    </div>
  )
}

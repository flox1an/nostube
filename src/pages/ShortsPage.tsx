import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrustFilter } from '@/hooks/useTrustFilter'

export function ShortsPage() {
  const { t } = useTranslation()
  const { relayOverride, setRelayOverride } = useAppContext()

  useEffect(() => {
    document.title = `${t('navigation.shorts')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])
  const relays = useStableRelays()

  const effectiveRelays = useMemo(
    () => (relayOverride ? [relayOverride] : relays),
    [relayOverride, relays]
  )

  // Memoize the loader to prevent recreation on every render
  // When relay override is active, skip EventStore cache to show only that relay's events
  const loader = useMemo(
    () =>
      videoTypeLoader('shorts', effectiveRelays, relayOverride ? { skipCache: true } : undefined),
    [effectiveRelays, relayOverride]
  )

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, effectiveRelays)
  const { filteredVideos, filterButton } = useTrustFilter(videos)

  return (
    <div className="max-w-560 mx-auto">
      <div className="sm:px-2">
        <CategoryButtonBar
          selectedRelay={relayOverride}
          onRelayChange={setRelayOverride}
          afterRelay={filterButton}
        />
      </div>
      <VideoTimelinePage
        videos={filteredVideos ?? []}
        loading={loading}
        exhausted={exhausted}
        onLoadMore={loadMore}
        layoutMode="vertical"
        emptyMessage={t('pages.shorts.noShorts')}
        loadingMessage={t('pages.shorts.loadingMore')}
        exhaustedMessage={t('pages.shorts.noMore')}
        className="sm:p-2"
      />
    </div>
  )
}

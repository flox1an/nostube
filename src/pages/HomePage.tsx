import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useMemo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = `${t('navigation.home')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])
  const relays = useStableRelays()
  const [relayOverride, setRelayOverride] = useState<string | null>(null)

  const effectiveRelays = useMemo(
    () => (relayOverride ? [relayOverride] : relays),
    [relayOverride, relays]
  )

  // Memoize the loader to prevent recreation on every render
  // When relay override is active, skip EventStore cache to show only that relay's events
  const loader = useMemo(
    () =>
      videoTypeLoader('videos', effectiveRelays, relayOverride ? { skipCache: true } : undefined),
    [effectiveRelays, relayOverride]
  )

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, effectiveRelays)

  if (!videos) return null

  return (
    <div className="max-w-560 mx-auto">
      <div className="sm:px-2">
        <CategoryButtonBar selectedRelay={relayOverride} onRelayChange={setRelayOverride} />
      </div>
      <VideoTimelinePage
        videos={videos}
        loading={loading}
        exhausted={exhausted}
        onLoadMore={loadMore}
        layoutMode="horizontal"
        emptyMessage={t('pages.home.noVideos')}
        exhaustedMessage={t('pages.home.noMore')}
        className="sm:px-2"
      />
    </div>
  )
}

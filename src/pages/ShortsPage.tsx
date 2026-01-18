import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function ShortsPage() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = `${t('navigation.shorts')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])
  const relays = useStableRelays()

  // Memoize the loader to prevent recreation on every render
  const loader = useMemo(() => videoTypeLoader('shorts', relays), [relays])

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  return (
    <div className="max-w-560 mx-auto">
      <VideoTimelinePage
        videos={videos}
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

import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { CategoryButtonBar } from '@/components/CategoryButtonBar'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation()
  const relays = useStableRelays()

  // Memoize the loader to prevent recreation on every render
  const loader = useMemo(() => videoTypeLoader('videos', relays), [relays])

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  if (!videos) return null

  return (
    <div className="max-w-560 mx-auto">
      <div className="sm:px-2">
        <CategoryButtonBar />
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

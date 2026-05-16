import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { useInfiniteScroll } from '@/hooks'
import type { VideoEvent } from '@/utils/video-event'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface VideoTimelinePageProps {
  videos: VideoEvent[]
  loading: boolean
  exhausted: boolean
  prefetching?: boolean
  subscriptionActive?: boolean
  onLoadMore: () => void
  onPrefetch?: () => void
  layoutMode?: 'horizontal' | 'vertical' | 'auto'
  emptyMessage?: string
  loadingMessage?: string
  exhaustedMessage?: string
  showSkeletons?: boolean
  className?: string
}

/**
 * Reusable component for displaying a video timeline with infinite scroll.
 * Combines VideoGrid and InfiniteScrollTrigger with consistent layout and messaging.
 *
 * Used by: HomePage, ShortsPage, HashtagPage, SubscriptionsPage
 */
export function VideoTimelinePage({
  videos,
  loading,
  exhausted,
  prefetching = false,
  subscriptionActive,
  onLoadMore,
  onPrefetch,
  layoutMode = 'horizontal',
  emptyMessage,
  loadingMessage,
  exhaustedMessage,
  showSkeletons = true,
  className = 'sm:p-4',
}: VideoTimelinePageProps) {
  const { t } = useTranslation()
  const { loadMoreRef, prefetchRef } = useInfiniteScroll({
    onLoadMore,
    onPrefetch,
    loading,
    prefetching,
    exhausted,
    subscriptionActive,
  })
  const triggerRef = useCallback(
    (node: Element | null) => {
      loadMoreRef(node)
      prefetchRef(node)
    },
    [loadMoreRef, prefetchRef]
  )

  // Use translations for default messages if not provided
  const defaultEmptyMessage = emptyMessage ?? t('video.noVideosFound')
  const defaultLoadingMessage = loadingMessage ?? t('common.loadingMore')
  const defaultExhaustedMessage = exhaustedMessage ?? t('video.noMoreVideos')

  const isLoadingMore = loading && videos.length > 0

  return (
    <div className={className}>
      <VideoGrid
        videos={videos}
        isLoading={loading}
        showSkeletons={showSkeletons}
        layoutMode={layoutMode}
      />

      <InfiniteScrollTrigger
        triggerRef={triggerRef}
        loading={isLoadingMore}
        exhausted={exhausted}
        itemCount={videos.length}
        emptyMessage={defaultEmptyMessage}
        loadingMessage={defaultLoadingMessage}
        exhaustedMessage={defaultExhaustedMessage}
      />
    </div>
  )
}

import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { useInfiniteScroll } from '@/hooks'
import type { VideoEvent } from '@/utils/video-event'
import { useTranslation } from 'react-i18next'

interface VideoTimelinePageProps {
  videos: VideoEvent[]
  loading: boolean
  exhausted: boolean
  onLoadMore: () => void
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
  onLoadMore,
  layoutMode = 'horizontal',
  emptyMessage,
  loadingMessage,
  exhaustedMessage,
  showSkeletons = true,
  className = 'sm:p-4',
}: VideoTimelinePageProps) {
  const { t } = useTranslation()
  const { ref } = useInfiniteScroll({
    onLoadMore,
    loading,
    exhausted,
  })

  // Use translations for default messages if not provided
  const defaultEmptyMessage = emptyMessage ?? t('video.noVideosFound')
  const defaultLoadingMessage = loadingMessage ?? t('common.loadingMore')
  const defaultExhaustedMessage = exhaustedMessage ?? t('video.noMoreVideos')

  const isLoadingInitial = loading && videos.length === 0
  const isLoadingMore = loading && videos.length > 0

  return (
    <div className={className}>
      <VideoGrid
        videos={videos}
        isLoading={isLoadingInitial}
        showSkeletons={showSkeletons}
        layoutMode={layoutMode}
      />

      <InfiniteScrollTrigger
        triggerRef={ref}
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

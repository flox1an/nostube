import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { useInfiniteScroll } from '@/hooks'
import type { VideoEvent } from '@/utils/video-event'

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
  emptyMessage = 'No videos found.',
  loadingMessage = 'Loading more videos...',
  exhaustedMessage = 'No more videos to load.',
  showSkeletons = true,
  className = 'sm:p-4',
}: VideoTimelinePageProps) {
  const { ref } = useInfiniteScroll({
    onLoadMore,
    loading,
    exhausted,
  })

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
        emptyMessage={emptyMessage}
        loadingMessage={loadingMessage}
        exhaustedMessage={exhaustedMessage}
      />
    </div>
  )
}

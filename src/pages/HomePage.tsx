import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'

export function HomePage() {
  const relays = useStableRelays()

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(
    videoTypeLoader('videos', relays),
    relays
  )

  if (!videos) return null

  return (
    <VideoTimelinePage
      videos={videos}
      loading={loading}
      exhausted={exhausted}
      onLoadMore={loadMore}
      layoutMode="horizontal"
      emptyMessage="No videos found."
      exhaustedMessage="No more videos to load."
      className="sm:px-4 sm:py-4"
    />
  )
}

import { useEffect, useState } from 'react'
import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { useStableRelays } from '@/hooks'

export function ShortsPage() {
  const relays = useStableRelays()

  const [loader, setLoader] = useState<TimelineLoader | undefined>()

  useEffect(() => {
    const newLoader = videoTypeLoader('shorts', relays)
    setLoader(newLoader)
  }, [relays])

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  return (
    <VideoTimelinePage
      videos={videos}
      loading={loading}
      exhausted={exhausted}
      onLoadMore={loadMore}
      layoutMode="vertical"
      emptyMessage="No shorts found."
      loadingMessage="Loading more shorts..."
      exhaustedMessage="No more shorts to load."
      className="sm:px-4 sm:py-4"
    />
  )
}

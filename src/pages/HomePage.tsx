import { useEffect, useState, useMemo } from 'react'
import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { useInfiniteScroll, useReadRelays } from '@/hooks'

export function HomePage() {
  const relaysFromHook = useReadRelays()

  // Stabilize relays array to prevent unnecessary loader recreations
  const relays = useMemo(() => relaysFromHook, [relaysFromHook.join(',')])

  const [loader, setLoader] = useState<TimelineLoader | undefined>()

  useEffect(() => {
    const newLoader = videoTypeLoader('videos', relays)
    setLoader(newLoader)
  }, [relays])

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  const { ref } = useInfiniteScroll({
    onLoadMore: loadMore,
    loading,
    exhausted,
  })

  if (!videos) return null

  return (
    <div className="sm:px-4 sm:py-4">
      <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="horizontal" />

      <InfiniteScrollTrigger
        triggerRef={ref}
        loading={loading}
        exhausted={exhausted}
        itemCount={videos.length}
        emptyMessage="No videos found."
        loadingMessage="Loading more videos..."
        exhaustedMessage="No more videos to load."
      />
    </div>
  )
}

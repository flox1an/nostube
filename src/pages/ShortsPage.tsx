import { useEffect, useState, useMemo } from 'react'
import { VideoGrid } from '@/components/VideoGrid'
import { InfiniteScrollTrigger } from '@/components/InfiniteScrollTrigger'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { useInfiniteScroll, useReadRelays } from '@/hooks'

export function ShortsPage() {
  const relaysFromHook = useReadRelays()

  // Stabilize relays array to prevent unnecessary loader recreations
  const relays = useMemo(() => relaysFromHook, [relaysFromHook.join(',')])

  const [loader, setLoader] = useState<TimelineLoader | undefined>()

  useEffect(() => {
    const newLoader = videoTypeLoader('shorts', relays)
    setLoader(newLoader)
  }, [relays])

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  const { ref } = useInfiniteScroll({
    onLoadMore: loadMore,
    loading,
    exhausted,
  })

  return (
    <div className="sm:px-4 sm:py-4">
      <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="vertical" />

      <InfiniteScrollTrigger
        triggerRef={ref}
        loading={loading}
        exhausted={exhausted}
        itemCount={videos.length}
        emptyMessage="No shorts found."
        loadingMessage="Loading more shorts..."
        exhaustedMessage="No more shorts to load."
      />
    </div>
  )
}

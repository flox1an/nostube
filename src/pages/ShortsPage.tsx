import React, { useEffect, useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { VideoGrid } from '@/components/VideoGrid'
import { useInView } from 'react-intersection-observer'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { TimelineLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from '@/hooks/useAppContext'

export function ShortsPage() {
  const { config } = useAppContext()
  const relays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )
  const [loader, setLoader] = useState<TimelineLoader | undefined>()

  useEffect(() => {
    const newLoader = videoTypeLoader('shorts', relays)
    console.log('Shorts.newLoader =', newLoader)
    setLoader(newLoader)
  }, [relays])

  console.log('Shorts.loader =', loader)
  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  })

  // Trigger load more when in view
  React.useEffect(() => {
    if (inView && !exhausted && !loading) {
      loadMore()
    }
  }, [inView, exhausted, loadMore])

  return (
    <div className="sm:px-4 sm:py-6">
      <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="vertical" />

      <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
        {!exhausted && videos.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more videos...
          </div>
        )}
        {exhausted && videos.length > 0 && (
          <div className="text-muted-foreground">No more shorts to load.</div>
        )}
      </div>
    </div>
  )
}

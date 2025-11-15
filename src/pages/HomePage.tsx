import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useMemo } from 'react'

export function HomePage() {
  const relays = useStableRelays()

  // Memoize the loader to prevent recreation on every render
  const loader = useMemo(() => videoTypeLoader('videos', relays), [relays])

  const { videos, loading, exhausted, loadMore } = useInfiniteTimeline(loader, relays)

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

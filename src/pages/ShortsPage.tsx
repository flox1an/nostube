import { VideoTimelinePage } from '@/components/VideoTimelinePage'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { videoTypeLoader } from '@/nostr/loaders'
import { useStableRelays } from '@/hooks'
import { useMemo } from 'react'

export function ShortsPage() {
  const relays = useStableRelays()

  // Memoize the loader to prevent recreation on every render
  const loader = useMemo(() => videoTypeLoader('shorts', relays), [relays])

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

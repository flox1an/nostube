import { VideoGrid } from '@/components/VideoGrid'
import { Loader2 } from 'lucide-react'
import { useFollowedAuthors } from '@/hooks/useFollowedAuthors'
import { useInView } from 'react-intersection-observer'
import { useMemo, useEffect } from 'react'
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline'
import { authorVideoLoader } from '@/nostr/loaders'

export function SubscriptionsPage() {
  const { data: followedProfiles = [] } = useFollowedAuthors()
  const followedPubkeys = useMemo(
    () => followedProfiles.map(profile => profile.pubkey),
    [followedProfiles]
  )

  // Choose loader for followed authors
  const getLoader = useMemo(() => {
    if (followedPubkeys.length === 0) {
      // Return empty loader if no followed authors
      return () => new (require('rxjs').Observable)()
    }
    // Use first followed author for now (could be extended to support multiple)
    return () => authorVideoLoader(followedPubkeys[0])()
  }, [followedPubkeys])

  const { videos, loading, exhausted, loadMore, reset } = useInfiniteTimeline(getLoader)

  // Load subscriptions timeline when component mounts or followed authors change
  useEffect(() => {
    reset()
    // auto-load first page
    const unsub = loadMore()
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [followedPubkeys]) // Only depend on followedPubkeys, not loadMore/reset

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  })

  // Trigger load more when in view
  useEffect(() => {
    if (inView && !exhausted && !loading) {
      loadMore()
    }
  }, [inView, exhausted, loading, loadMore])

  return (
    <div className="sm:p-4">
      <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="auto" />

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
        {!exhausted && videos.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more videos...
          </div>
        )}
        {exhausted && videos.length > 0 && (
          <div className="text-muted-foreground">No more videos to load.</div>
        )}
        {followedPubkeys.length === 0 && (
          <div className="text-muted-foreground">Follow some authors to see their videos here.</div>
        )}
      </div>
    </div>
  )
}

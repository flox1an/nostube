import { Loader2 } from 'lucide-react';
import { VideoGrid } from '@/components/VideoGrid';
import { useInView } from 'react-intersection-observer';
import { useEffect, useMemo } from 'react';
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline';
import { videoTypeLoader } from '@/nostr/loaders';

export function ShortsPage() {
  // Choose loader for shorts
  const getLoader = useMemo(() => {
    return () => videoTypeLoader('shorts')();
  }, []);

  const { videos, loading, exhausted, loadMore, reset } = useInfiniteTimeline(getLoader);
  
  // Load shorts timeline when component mounts
  useEffect(() => {
    reset();
    // auto-load first page
    const unsub = loadMore();
    return () => { if (typeof unsub === "function") unsub(); };
  }, []); // Empty dependency array - only run once on mount

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });

  // Trigger load more when in view
  useEffect(() => {
    if (inView && !exhausted && !loading) {
      // loadMore();
    }
  }, [inView, exhausted, loading, loadMore]);

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
          <div className="text-muted-foreground">
            No more shorts to load.
          </div>
        )}
      </div>
    </div>
  );
}

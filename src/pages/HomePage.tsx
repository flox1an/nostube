import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { VideoGrid } from '@/components/VideoGrid';
import { useInView } from 'react-intersection-observer';
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline';
import { videoTypeLoader } from '@/nostr/loaders';

export function HomePage() {
  // Choose loader by video type (videos, shorts, all)
  const getLoader = useMemo(() => {
    return () => videoTypeLoader('videos')();
  }, []);

  const { videos, loading, exhausted, loadMore, reset } = useInfiniteTimeline(getLoader);
  
  // Load videos timeline when component mounts
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
  React.useEffect(() => {
    if (inView && !exhausted && !loading) {
      //loadMore();
    }
  }, [inView, exhausted, loading, loadMore]);

  return (
    <div className="sm:px-4 sm:py-6">
      <VideoGrid videos={videos} isLoading={loading} showSkeletons={true} layoutMode="horizontal" />

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
        {!exhausted && videos.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more videos...
          </div>
        )}
        {exhausted && videos.length > 0 && (
          <div className="text-muted-foreground">
            No more videos to load.
          </div>
        )}
        {videos.length === 0 && !loading && (
          <div className="text-muted-foreground">
            No videos found.
          </div>
        )}
      </div>
    </div>
  );
}

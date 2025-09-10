import React, { useEffect, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { VideoGrid } from '@/components/VideoGrid';
import { useInView } from 'react-intersection-observer';
import { useInfiniteTimeline } from '@/nostr/useInfiniteTimeline';
import { videoTypeLoader } from '@/nostr/loaders';
import { TimelineLoader } from 'applesauce-loaders/loaders';
import { useAppContext } from '@/hooks/useAppContext';

export function HomePage() {
  const { config } = useAppContext();
  const relays = useMemo(() => config.relays.filter(r => r.tags.includes('read')).map(r => r.url), [config.relays]);
  const [loader, setLoader] = useState<TimelineLoader | undefined>();

  useEffect(() => {
    const newLoader = videoTypeLoader('videos', relays);
    console.log('Home.newLoader =', newLoader);
    setLoader(newLoader);
  }, [relays]);

  console.log('Home.loader =', loader);
  const { videos, loading, exhausted, loadMore, reset } = useInfiniteTimeline(loader, relays);

  // Load videos timeline when component mounts or when route changes to this page
  useEffect(() => {
    if (!loader) {
      console.log('Home: loader not ready yet');
      return;
    }
    // reset();
    //console.log('Home.reset called');
    // auto-load first page
    //const unsub = loadMore();
    //return () => {
    //  if (typeof unsub === 'function') unsub();
    //};
  }, [loader, reset, loadMore]); // Reset when pathname changes (route navigation)

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });

  // Trigger load more when in view
  React.useEffect(() => {
    if (inView && !exhausted && !loading) {
      loadMore();
    }
  }, [inView, exhausted, loadMore]);

  if (!videos) return null;

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
        {exhausted && videos.length > 0 && <div className="text-muted-foreground">No more videos to load.</div>}
        {videos.length === 0 && !loading && <div className="text-muted-foreground">No videos found.</div>}
      </div>
    </div>
  );
}

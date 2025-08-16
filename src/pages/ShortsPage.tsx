import { Loader2 } from 'lucide-react';
import { VideoGrid } from '@/components/VideoGrid';
import { useInView } from 'react-intersection-observer';
import { useVideoTimelineContext } from '@/contexts/VideoTimelineContext';
import { useEffect } from 'react';


export function ShortsPage() {
  const { videosLoading, videos, loadTimeline } = useVideoTimelineContext();
  
  // Load shorts timeline when component mounts
  useEffect(() => {
    loadTimeline('shorts');
  }, [loadTimeline]);

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });
  const hasMore = true;
  return (
    <div className=" sm:px-4 sm:py-6">
      <VideoGrid videos={videos} isLoading={videosLoading} showSkeletons={true} layoutMode="vertical" />

      <div ref={loadMoreRef} className="w-full py-8 flex items-center justify-center">
        {hasMore && videos.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more videos...
          </div>
        )}
      </div>
    </div>
  );
}

import { VideoGrid } from '@/components/VideoGrid';
import { Loader2 } from 'lucide-react';
import { useFollowedAuthors } from '@/hooks/useFollowedAuthors';
import { useVideoTimelineContext } from '@/contexts/VideoTimelineContext';
import { useInView } from 'react-intersection-observer';
import { useMemo, useEffect } from 'react';

export function SubscriptionsPage() {
  const { data: followedProfiles = [] } = useFollowedAuthors();
  const followedPubkeys = useMemo(() => followedProfiles.map(profile => profile.pubkey), [followedProfiles]);
  const { videos, videosLoading, loadTimeline } = useVideoTimelineContext();
  
  // Load subscriptions timeline when component mounts
  useEffect(() => {
    loadTimeline('all', followedPubkeys);
  }, [loadTimeline, followedPubkeys]);

  // Intersection observer for infinite loading
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });
  const hasMore = true;

  return (
    <div className="sm:p-4">
      <VideoGrid videos={videos} isLoading={videosLoading} showSkeletons={true} layoutMode="auto" />

      {/* Infinite scroll trigger */}
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

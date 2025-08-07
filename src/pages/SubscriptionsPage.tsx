import { VideoGrid } from '@/components/VideoGrid';
import { Loader2 } from 'lucide-react';
import { useFollowedAuthors } from '@/hooks/useFollowedAuthors';
import useVideoTimeline from '@/hooks/useVideoTimeline';
import { useInView } from 'react-intersection-observer';

export function SubscriptionsPage() {
  const { data: followedProfiles = [] } = useFollowedAuthors();
console.log('followedPubkeys',followedProfiles);
  const {videos, videosLoading} = useVideoTimeline('all', followedProfiles.map(profile => profile.pubkey));
 
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

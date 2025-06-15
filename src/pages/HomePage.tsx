import { useVideoCache } from '@/contexts/VideoCacheContext';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';
import { VideoGrid } from '@/components/VideoGrid';
import { useEffect } from 'react';

export function HomePage() {
  const { 
    videos,  
    isLoading, 
    hasMore,
    totalVideos,
    loadMoreRef,
    setVideoType,
    initSearch,
    setFollowedPubkeys,
    setLikedVideoIds
  } = useVideoCache();

  const { config } = useAppContext();

  useEffect(() => {
    setVideoType('videos');
    setFollowedPubkeys([]);
    setLikedVideoIds([]);
    initSearch(config.relays);
  }, []);

  return (
    <div className="sm:px-4 sm:py-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground p-2">
          {totalVideos} videos loaded
        </div>
      </div>

      <VideoGrid 
        videos={videos} 
        videoType={config.videoType} 
        isLoading={isLoading} 
        showSkeletons={true} 
      />

      {/* Infinite scroll trigger */}
      <div 
        ref={loadMoreRef} 
        className="w-full py-8 flex items-center justify-center"
      >
        {hasMore && (videos.length > 0) && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more videos...
          </div>
        )}
      </div>
    </div>
  );
}
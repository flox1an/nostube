import { useVideoCache } from '@/contexts/VideoCacheContext';
import { Loader2 } from 'lucide-react';
import { VideoTypeSelection } from '@/components/VideoTypeSelection';
import { useAppContext } from '@/hooks/useAppContext';
import { VideoGrid } from '@/components/VideoGrid';
import { useEffect } from 'react';

export function HomePage() {
  const { config, updateConfig } = useAppContext();
  const { 
    videos,  
    isLoading, 
    hasMore,
    totalVideos,
    loadMoreRef,
    setVideoTypes,
    initSearch,
    setFollowedPubkeys,
    setLikedVideoIds
  } = useVideoCache();

  const handleTypeChange = (value: 'all' | 'shorts' | 'videos') => {
    updateConfig(current => ({ ...current, videoType: value }));
    setVideoTypes(value);
  };

  useEffect(() => {
    setFollowedPubkeys([]);
    setLikedVideoIds([]);
    initSearch();
  }, []);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <VideoTypeSelection 
          selectedType={config.videoType}
          onTypeChange={handleTypeChange}
        />

        <div className="text-sm text-muted-foreground">
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
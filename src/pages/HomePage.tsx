import { useVideoCache } from "@/contexts/VideoCacheContext";
import { Loader2 } from "lucide-react";
import { useAppContext } from "@/hooks/useAppContext";
import { VideoGrid } from "@/components/VideoGrid";
import { useEffect } from "react";

export function HomePage() {
  const {
    videos,
    isLoading,
    hasMore,
    loadMoreRef,
    setVideoType,
    initSearch,
    setFollowedPubkeys,
    setLikedVideoIds,
    isWorkerReady
  } = useVideoCache();

  const { config } = useAppContext();
 
  useEffect(() => {
    if (config.relays && config.relays.length > 0 && isWorkerReady) {
      setVideoType("videos");
      setFollowedPubkeys([]);
      setLikedVideoIds([]);
      initSearch(config.relays);
    }
  }, [config.relays, isWorkerReady]);

  return (
    <div className="sm:px-4 sm:py-6">

      <VideoGrid
        videos={videos}
        videoType={'videos'}
        isLoading={isLoading}
        showSkeletons={true}
      />

      {/* Infinite scroll trigger */}
      <div
        ref={loadMoreRef}
        className="w-full py-8 flex items-center justify-center"
      >
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

import { useEffect } from "react";
import { useVideoCache } from "@/contexts/VideoCacheContext";
import { useAppContext } from "@/hooks/useAppContext";
import { VideoGrid } from "@/components/VideoGrid";
import { Loader2 } from "lucide-react";
import { useFollowedAuthors } from "@/hooks/useFollowedAuthors";

export function SubscriptionsPage() {
  const {
    totalVideos,
    videos,
    isLoading,
    hasMore,
    setFollowedPubkeys,
    loadMoreRef,
    initSearch,
    setLikedVideoIds
  } = useVideoCache();
  const { config } = useAppContext();
  const { data: followedPubkeys = [] } = useFollowedAuthors();

  useEffect(() => {
    if (followedPubkeys.length > 0) {
      setLikedVideoIds([]);
      setFollowedPubkeys(followedPubkeys);
      initSearch();
    }
  }, [initSearch, setFollowedPubkeys, followedPubkeys]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
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

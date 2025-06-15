import { useEffect } from "react";
import { useVideoCache } from "@/contexts/VideoCacheContext";
import { VideoGrid } from "@/components/VideoGrid";
import { Loader2 } from "lucide-react";
import { useFollowedAuthors } from "@/hooks/useFollowedAuthors";
import { useAppContext } from "@/hooks/useAppContext";

export function SubscriptionsPage() {
  const {
    totalVideos,
    videos,
    isLoading,
    hasMore,
    setFollowedPubkeys,
    loadMoreRef,
    initSearch,
    setLikedVideoIds,
    setVideoType
  } = useVideoCache();
  const { data: followedPubkeys = [] } = useFollowedAuthors();
  const { config } = useAppContext();

  useEffect(() => {
    if (followedPubkeys.length > 0) {
      setVideoType('all');
      setLikedVideoIds([]);
      setFollowedPubkeys(followedPubkeys);
      initSearch(config.relays);
    }
  }, [initSearch, setFollowedPubkeys, followedPubkeys]);

  return (
    <div className="sm:px-4 sm:spy-6">

      <VideoGrid
        videos={videos}
        videoType={'all'}
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

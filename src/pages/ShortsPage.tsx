import { useVideoCache } from "@/contexts/VideoCacheContext";
import { Loader2 } from "lucide-react";
import { VideoGrid } from "@/components/VideoGrid";
import { useEffect } from "react";
import { useAppContext } from "@/hooks/useAppContext";

export function ShortsPage() {
  const {
    videos,
    isLoading,
    hasMore,
    loadMoreRef,
    setVideoType,
    initSearch,
    setFollowedPubkeys,
    setLikedVideoIds,
  } = useVideoCache();

  const { config } = useAppContext();

  useEffect(() => {
    setVideoType("shorts");
    setFollowedPubkeys([]);
    setLikedVideoIds([]);
    initSearch(config.relays);
  }, []);

  return (
    <div className=" sm:px-4 sm:py-6">

      <VideoGrid
        videos={videos}
        videoType={"shorts"}
        isLoading={isLoading}
        showSkeletons={true}
      />

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

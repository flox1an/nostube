import { VideoGrid } from "@/components/VideoGrid";
import { useVideoCache } from "@/contexts/VideoCacheContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useLikedEvents } from "@/hooks/useLikedEvents";
import { useEffect } from 'react';

export function LikedVideosPage() {
  const { setVideoTypes, setFilterByFollowedAuthors, videos, setLikedVideoIds } = useVideoCache();
  const {  config } = useAppContext();
  const { data: likedEventIds = [] } = useLikedEvents();

  // This effect ensures that when the LikedVideosPage is mounted,
  // the video cache worker is configured to filter by liked video IDs.
  useEffect(() => {
    // First, clear any other filters.
    // Since liked videos are a specific list of IDs, we don't need a video type filter.
    // We also explicitly disable the followed authors filter.
    setVideoTypes('all'); // Set to 'all' to ensure no kind filtering is applied
    setFilterByFollowedAuthors(false);

    // When navigating away, we might want to reset the filters, but for now,
    // we'll let the next page's useEffect or user interaction handle it.
  }, [setVideoTypes, setFilterByFollowedAuthors, setLikedVideoIds, likedEventIds]);


  return (
    <div className="p-4">
      <div className="text-2xl font-semibold mb-4">Liked Videos</div>
      <VideoGrid videos={videos} videoType={config.videoType} />
    </div>
  );
} 
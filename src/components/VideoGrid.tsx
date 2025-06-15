import { VideoCard, VideoCardSkeleton } from "@/components/VideoCard";
import { VideoEvent } from "@/utils/video-event";
import { cn } from "@/lib/utils";
import { VideoType } from "@/lib/video-types";
import { Card, CardContent } from "@/components/ui/card";
import { RelaySelector } from "@/components/RelaySelector";

interface VideoGridProps {
  videos: VideoEvent[];
  videoType: VideoType;
  isLoading?: boolean;
  showSkeletons?: boolean;
}

export function VideoGrid({
  videos,
  videoType,
  isLoading,
  showSkeletons,
}: VideoGridProps) {
  const isShort = videoType === "shorts";
  const isHorizontal = videoType === "videos";
  const cardFormat = isShort
    ? "vertical"
    : isHorizontal
    ? "horizontal"
    : "square";

  if (isLoading && showSkeletons) {
    return (
      <div
        className={cn(
          "grid gap-6",
          isShort
            ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3  lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8"
            : isHorizontal
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        )}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <VideoCardSkeleton key={i} format={cardFormat} />
        ))}
      </div>
    );
  }

  if (videos.length === 0 && !isLoading) {
    return (
      <div className="col-span-full">
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-6">
              <p className="text-muted-foreground">
                No results found. Try another relay?
              </p>
              <RelaySelector className="w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-6",
        isShort
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8"
          : isHorizontal
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      )}
    >
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} format={cardFormat} />
      ))}
    </div>
  );
}

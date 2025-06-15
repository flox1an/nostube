import { VideoCard } from '@/components/VideoCard';
import { VideoEvent } from '@/utils/video-event';
import { cn } from '@/lib/utils';
import { VideoType } from '@/lib/video-types';

// Placeholder for VideoCardSkeleton, assume it's defined elsewhere or will be moved
// For now, I'll copy a basic version to avoid immediate errors.
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function VideoCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <Skeleton className="w-full aspect-video" />
        <div className="p-4 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </CardContent>
    </Card>
  );
}

interface VideoGridProps {
  videos: VideoEvent[];
  videoType: VideoType;
  isLoading?: boolean;
  showSkeletons?: boolean;
}

export function VideoGrid({ videos, videoType, isLoading, showSkeletons }: VideoGridProps) {
  const isShort = videoType === 'shorts';
  const cardFormat = isShort ? "vertical" : "square";

  if (isLoading && showSkeletons) {
    return (
      <div className={cn(
        "grid gap-6",
        isShort 
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      )}>
        {Array.from({ length: 12 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (videos.length === 0 && !isLoading) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold">No videos found</h2>
        <p className="text-muted-foreground mt-2">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-6",
      isShort 
        ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    )}>
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} format={cardFormat} />
      ))}
    </div>
  );
} 
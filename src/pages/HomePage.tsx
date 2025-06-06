import { useVideoCache } from '@/hooks/useVideoCache';
import { VideoCard } from '@/components/VideoCard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

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

export function HomePage() {
  const { 
    videos,  
    isLoading, 
    hasMore,
    totalVideos,
    loadMoreRef,
  } = useVideoCache();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">

        <div className="text-sm text-muted-foreground">
          {totalVideos} videos loaded
        </div>
      </div>

      {videos.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {/* Infinite scroll trigger */}
          <div 
            ref={loadMoreRef} 
            className="w-full py-8 flex items-center justify-center"
          >
            {hasMore && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more videos...
              </div>
            )}
          </div>
        </>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold">No videos found</h2>
          <p className="text-muted-foreground mt-2">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}
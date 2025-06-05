import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { useVideoCache } from '@/hooks/useVideoCache';
import { SearchBar } from '@/components/SearchBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistance } from 'date-fns';
import { Loader2 } from 'lucide-react';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function VideoCard({ video }: { video: any }) {
  const author = useAuthor(video.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || video.pubkey.slice(0, 8);

  return (
    <Link to={`/video/${video.identifier}`}>
      <Card className="hover:bg-accent transition-colors">
        <CardContent className="p-0">
          <div className="relative">
            <img 
              src={video.thumb} 
              alt={video.title}
              className="w-full aspect-video object-cover"
            />
            <div className="absolute bottom-2 right-2 bg-black/80 text-white px-1 rounded text-sm">
              {formatDuration(video.duration)}
            </div>
          </div>
          <div className="p-4">
            <h3 className="font-medium line-clamp-2">{video.title}</h3>
            <div className="text-sm text-muted-foreground mt-2">{name}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistance(new Date(video.created_at * 1000), new Date(), { addSuffix: true })}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

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
    allTags, 
    isLoading, 
    hasMore,
    totalVideos,
    searchVideos, 
    filterByTags,
    loadMoreRef,
  } = useVideoCache();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <SearchBar
          className="flex-1 max-w-2xl"
          allTags={allTags}
          onSearch={searchVideos}
          onTagsChange={filterByTags}
        />
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
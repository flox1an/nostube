import { useParams } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { VideoCard } from '@/components/VideoCard';
import { FollowButton } from '@/components/FollowButton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Link } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAppContext } from '@/hooks/useAppContext';

interface AuthorStats {
  videoCount: number;
  totalViews: number;
  joinedDate: Date;
}

function AuthorProfile({ pubkey }: { pubkey: string }) {
  const { data: metadata, isLoading } = useAuthor(pubkey);
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-6">
        <Skeleton className="h-32 w-32 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-96" />
        </div>
      </div>
    );
  }

  const author = metadata?.metadata;
  const name = author?.name || pubkey.slice(0, 8);

  return (
    <div className="flex items-start gap-6">
      <Avatar className="h-32 w-32">
        <AvatarImage src={author?.picture} />
        <AvatarFallback className="text-4xl">{name[0]}</AvatarFallback>
      </Avatar>

      <div className="space-y-4 flex-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {author?.display_name || name}
            </h1>
            {author?.nip05 && (
              <p className="text-muted-foreground">{author.nip05}</p>
            )}
          </div>
          <FollowButton pubkey={pubkey} />
        </div>

        {author?.about && (
          <p className="text-muted-foreground whitespace-pre-wrap">
            {author.about}
          </p>
        )}

        <div className="flex items-center gap-4">
          {author?.website && (
            <a 
              href={author.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
              <Link className="h-4 w-4" />
              Website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthorPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { nostr } = useNostr();
  const { presetRelays } = useAppContext();
  // Query for author's videos
  const { data: videos = [], isLoading: isLoadingVideos } = useQuery({
    queryKey: ['author-videos', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      
      const events = await nostr.query(
        [{
          kinds: [34235],
          authors: [pubkey],
          limit: 500,
        }],
        { signal, relays: presetRelays?.map((relay) => relay.url) }
      );

      return events
        .map(event => {
          const title = event.tags.find(t => t[0] === 'title')?.[1] || '';
          const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || '';
          const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || '';
          const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0');
          const identifier = event.tags.find(t => t[0] === 'd')?.[1] || '';
          const tags = event.tags.filter(t => t[0] === 't').map(t => t[1]);
          
          return {
            id: event.id,
            identifier,
            title,
            description,
            thumb,
            pubkey: event.pubkey,
            created_at: event.created_at,
            duration,
            tags,
          };
        })
        .filter(video => video.title && video.thumb && video.identifier)
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
  });

  if (!pubkey) return null;

  // Get author stats
  const stats: AuthorStats = {
    videoCount: videos.length,
    totalViews: 0, // Could be implemented with NIP-78 view counts
    joinedDate: videos.length > 0 
      ? new Date(Math.min(...videos.map(v => v.created_at * 1000)))
      : new Date(),
  };

  // Get unique tags from all videos
  const uniqueTags = Array.from(new Set(videos.flatMap(video => video.tags)))
    .filter(Boolean)
    .sort();

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="border-b">
          <AuthorProfile pubkey={pubkey} />
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center gap-6 mb-6 text-sm">
            <div>
              <span className="font-semibold">{stats.videoCount}</span>
              <span className="text-muted-foreground ml-2">videos</span>
            </div>
            <div>
              <span className="text-muted-foreground">Joined</span>
              <span className="ml-2">{formatDistanceToNow(stats.joinedDate, { addSuffix: true })}</span>
            </div>
          </div>

          <Tabs defaultValue="videos">
            <TabsList>
              <TabsTrigger value="videos">Videos</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
            </TabsList>

            <TabsContent value="videos" className="mt-6">
              {isLoadingVideos ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="w-full aspect-video" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : videos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {videos.map((video) => (
                    <VideoCard key={video.id} video={video} hideAuthor />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No videos uploaded yet
                </div>
              )}
            </TabsContent>

            <TabsContent value="tags" className="mt-6">
              <ScrollArea className="h-[400px]">
                <div className="flex flex-wrap gap-2">
                  {uniqueTags.map(tag => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
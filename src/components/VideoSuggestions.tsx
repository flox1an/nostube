import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VideoSuggestion {
  id: string;
  identifier: string;
  title: string;
  thumb: string;
  duration: number;
  pubkey: string;
  created_at: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function VideoSuggestionItem({ video }: { video: VideoSuggestion }) {
  const author = useAuthor(video.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || video.pubkey.slice(0, 8);

  return (
    <Link to={`/video/${video.identifier}`}>
      <Card className="flex mb-4 hover:bg-accent transition-colors border-none">
        <div className="relative w-40 h-24 flex-shrink-0">
          <img 
            src={video.thumb} 
            alt={video.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-1 right-1 bg-black/80 text-white px-1 rounded text-xs">
            {formatDuration(video.duration)}
          </div>
        </div>
        <div className="p-2">
          <div className="font-medium line-clamp-2 text-sm">{video.title}</div>
          <div className="text-xs text-muted-foreground mt-1">{name}</div>
        </div>
      </Card>
    </Link>
  );
}

interface VideoSuggestionsProps {
  currentVideoId?: string;
}

export function VideoSuggestions({ currentVideoId }: VideoSuggestionsProps) {
  const { nostr } = useNostr();

  const { data: suggestions = [] } = useQuery<VideoSuggestion[]>({
    queryKey: ['video-suggestions', currentVideoId],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{
          kinds: [34235],
          limit: 20,
        }],
        { signal }
      );

      return events
        .filter(event => {
          const identifier = event.tags.find(t => t[0] === 'd')?.[1];
          return identifier !== currentVideoId;
        })
        .map(event => {
          const title = event.tags.find(t => t[0] === 'title')?.[1] || '';
          const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || '';
          const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0');
          const identifier = event.tags.find(t => t[0] === 'd')?.[1] || '';
          
          return {
            id: event.id,
            identifier,
            title,
            thumb,
            duration,
            pubkey: event.pubkey,
            created_at: event.created_at,
          };
        })
        .filter(video => video.title && video.thumb && video.identifier);
    },
  });

  return (
    <ScrollArea className="h-[calc(100vh-4rem)]">
      <div className="pr-4">
        {suggestions.map((video) => (
          <VideoSuggestionItem key={video.id} video={video} />
        ))}
      </div>
    </ScrollArea>
  );
}
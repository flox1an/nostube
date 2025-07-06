import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { processEvent, VideoEvent } from '@/utils/video-event';
import { getKindsForType, VideoType } from '@/lib/video-types';
import { NostrEvent } from '@nostrify/nostrify';
import { formatDistance } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys';
import { PlayProgressBar } from './PlayProgressBar';
import { useMemo } from 'react';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function VideoSuggestionItem({ video }: { video: VideoEvent }) {
  const author = useAuthor(video.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || video.pubkey.slice(0, 8);

  return (
    <Link to={`/video/${video.link}`}>
      <div className="flex mb-4 hover:bg-accent rounded-lg transition-colors border-none ">
        <div className="relative w-40 h-24 flex-shrink-0">
          <img src={video.images[0]} alt={video.title} className="w-full h-full object-cover rounded-md" />
          <PlayProgressBar videoId={video.id} duration={video.duration} />
          {video.duration > 0 && (
            <div className="absolute bottom-1 right-1 bg-black/80 text-white px-1 rounded text-xs">
              {formatDuration(video.duration)}
            </div>
          )}
        </div>
        <div className="p-1 pl-3">
          <div className="font-medium line-clamp-2 text-sm">{video.title}</div>
          <div className="text-xs text-muted-foreground mt-1">{name}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatDistance(new Date(video.created_at * 1000), new Date(), {
              addSuffix: true,
            })}{' '}
          </div>
        </div>
      </div>
    </Link>
  );
}

function VideoSuggestionItemSkeleton() {
  return (
    <div className="flex mb-4">
      <div className="relative w-40 h-24 flex-shrink-0">
        <Skeleton className="w-full h-full rounded-md" />
      </div>
      <div className="p-1 pl-3 space-y-2 flex-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

interface VideoSuggestionsProps {
  currentVideoId?: string;
  relays: string[];
  authorPubkey?: string;
  currentVideoType?: VideoType;
}

export function VideoSuggestions({ currentVideoId, currentVideoType, relays, authorPubkey }: VideoSuggestionsProps) {
  const { nostr } = useNostr();
  const blockedPubkeys = useReportedPubkeys();

  const { data: authorSuggestions = [], isLoading: authorIsLoading } = useQuery<NostrEvent[]>({
    enabled: authorPubkey != undefined,
    queryKey: ['video-suggestions-author', authorPubkey],
    queryFn: async ({ signal }) => {
      console.log(['video-suggestions-author', authorPubkey]);

      return await nostr.query(
        [
          {
            kinds: getKindsForType('all'),
            authors: [authorPubkey!],
            limit: 30, // Limit author-specific videos
          },
        ],
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
          relays,
        }
      );
    },
  });

  const { data: globalSuggestions = [], isLoading: globalIsLoading } = useQuery<NostrEvent[]>({
    queryKey: ['video-suggestions-global'],
    queryFn: async ({ signal }) => {
      console.log(['video-suggestions-global']);

      return await nostr.query(
        [
          {
            kinds: currentVideoType ? getKindsForType(currentVideoType) : getKindsForType('all'),
            limit: 30, // Fetch more to allow for filtering
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]), relays }
      );
    },
  });

  const suggestions = useMemo(() => {
    const events = [...authorSuggestions, ...globalSuggestions];

    // Process and filter unique videos, excluding the current video
    const processedVideos: VideoEvent[] = [];
    const seenIds = new Set<string>();

    for (const event of events) {
      if (blockedPubkeys && blockedPubkeys[event.pubkey]) continue;
      const processed = processEvent(event, relays);
      if (processed && processed.id !== currentVideoId && !seenIds.has(processed.id)) {
        processedVideos.push(processed);
        seenIds.add(processed.id);
      }
    }

    return processedVideos.slice(0, 30); // Return up to 30 unique suggestions
  }, [authorSuggestions, globalSuggestions]);

  return (
    /* <ScrollArea className="h-[calc(100vh-4rem)]"> */
    <div className="sm:grid grid-cols-2 gap-4 lg:block">
      {authorIsLoading || globalIsLoading
        ? Array.from({ length: 10 }).map((_, i) => <VideoSuggestionItemSkeleton key={i} />)
        : suggestions.map(video => <VideoSuggestionItem key={video.id} video={video} />)}
    </div>
  );
}

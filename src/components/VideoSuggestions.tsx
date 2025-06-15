import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuthor } from "@/hooks/useAuthor";
import { Card } from "@/components/ui/card";
import { processEvent, VideoEvent } from "@/utils/video-event";
import { getKindsForType } from "@/lib/video-types";
import { NostrEvent } from '@nostrify/nostrify';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function VideoSuggestionItem({ video }: { video: VideoEvent }) {
  const author = useAuthor(video.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || video.pubkey.slice(0, 8);

  return (
    <Link to={`/video/${video.link}`}>
      <Card className="flex mb-4 hover:bg-accent transition-colors border-none">
        <div className="relative w-40 h-24 flex-shrink-0">
          <img
            src={video.thumb}
            alt={video.title}
            className="w-full h-full object-cover"
          />
          {video.duration > 0 &&
          <div className="absolute bottom-1 right-1 bg-black/80 text-white px-1 rounded text-xs">
            {formatDuration(video.duration)}
          </div>}
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
  relays: string[];
  authorPubkey?: string;
}

export function VideoSuggestions({
  currentVideoId,
  relays,
  authorPubkey,
}: VideoSuggestionsProps) {
  const { nostr } = useNostr();
  const { data: suggestions = [] } = useQuery<VideoEvent[]>(
    {
      queryKey: ["video-suggestions", currentVideoId, authorPubkey],
      queryFn: async ({ signal }) => {
        let combinedEvents: NostrEvent[] = [];
        console.log(["video-suggestions", currentVideoId, authorPubkey]);

        // 1. Fetch videos from the specific author if provided
        if (authorPubkey) {
          const authorEvents = await nostr.query(
            [
              {
                kinds: getKindsForType('all'),
                authors: [authorPubkey],
                limit: 15, // Limit author-specific videos
                
              },
            ],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]), relays }
          );
          combinedEvents = combinedEvents.concat(authorEvents);
        }

        // 2. Fetch general recent videos
        const generalEvents = await nostr.query(
          [
            {
              kinds: getKindsForType('all'),
              limit: 30, // Fetch more to allow for filtering
            },
          ],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]), relays }
        );
        combinedEvents = combinedEvents.concat(generalEvents);

        // Process and filter unique videos, excluding the current video
        const processedVideos: VideoEvent[] = [];
        const seenIds = new Set<string>();

        for (const event of combinedEvents) {
          const processed = processEvent(event, relays);
          if (processed && processed.id !== currentVideoId && !seenIds.has(processed.id)) {
            processedVideos.push(processed);
            seenIds.add(processed.id);
          }
        }

        return processedVideos.slice(0, 30); // Return up to 30 unique suggestions
      },
    }
  );

  return (
    /* <ScrollArea className="h-[calc(100vh-4rem)]"> */
    <div className="pr-4 sm:grid grid-cols-2 gap-4 lg:block">
      {suggestions.map((video) => (
        <VideoSuggestionItem key={video.id} video={video} />
      ))}
    </div>
  );
}

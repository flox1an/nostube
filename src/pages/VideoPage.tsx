import { useParams, Link } from "react-router-dom";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useAuthor } from "@/hooks/useAuthor";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoComments } from "@/components/VideoComments";
import { VideoSuggestions } from "@/components/VideoSuggestions";
import { ButtonWithReactions } from "@/components/ButtonWithReactions";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistance } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "@/hooks/useAppContext";
import { useEffect } from "react";

interface VideoData {
  id: string;
  title: string;
  description: string;
  url: string;
  mime: string;
  thumb: string;
  duration: number;
  dimensions?: string;
  size?: number;
  tags: string[];
  pubkey: string;
  created_at: number;
}

function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const { nostr } = useNostr();
  const { presetRelays } = useAppContext();

  const { data: video } = useQuery<VideoData | null>({
    queryKey: ["video", id],
    queryFn: async ({ signal }) => {
      if (!id) return null;

      const events = await nostr.query(
        [
          {
            kinds: [34235],
            "#d": [id],
          },
        ],
        { signal, relays: presetRelays?.map((relay) => relay.url) }
      );

      if (!events.length) return null;

      const event = events[0];
      return {
        id: event.id,
        title: event.tags.find((t) => t[0] === "title")?.[1] || "",
        description:
          event.tags.find((t) => t[0] === "description")?.[1] ||
          event.tags.find((t) => t[0] === "summary")?.[1] ||
          event.content,
        url: event.tags.find((t) => t[0] === "url")?.[1] || "",
        mime: event.tags.find((t) => t[0] === "m")?.[1] || "",
        thumb: event.tags.find((t) => t[0] === "thumb")?.[1] || "",
        duration: parseInt(
          event.tags.find((t) => t[0] === "duration")?.[1] || "0"
        ),
        dimensions: event.tags.find((t) => t[0] === "dim")?.[1],
        size: parseInt(event.tags.find((t) => t[0] === "size")?.[1] || "0"),
        tags: event.tags.filter((t) => t[0] === "t").map((t) => t[1]),
        pubkey: event.pubkey,
        created_at: event.created_at,
      };
    },
  });

  const author = useAuthor(video?.pubkey || "");
  const metadata = author.data?.metadata;
  const authorName = metadata?.name || video?.pubkey?.slice(0, 8);

  useEffect(() => {
    console.log(video);
  }, [video]);

  if (!video) {
    return <div>Video not found</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex gap-6 flex-col md:flex-row">
        <div className="flex-1">
          <Card>
            <CardContent className="p-0">
              <VideoPlayer
                url={video.url}
                mime={video.mime}
                poster={video.thumb}
                className="w-full aspect-video"
              />
            </CardContent>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <h1 className="text-2xl font-bold">{video.title}</h1>

                <div className="flex items-start justify-between">
                  <Link
                    to={`/author/${video.pubkey}`}
                    className="flex items-center gap-4 hover:bg-accent p-2 rounded-lg transition-colors"
                  >
                    <Avatar>
                      <AvatarImage src={metadata?.picture} />
                      <AvatarFallback>{authorName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold">{authorName}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDistance(
                          new Date(video.created_at * 1000),
                          new Date(),
                          { addSuffix: true }
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2">
                    <ButtonWithReactions
                      eventId={video.id}
                      authorPubkey={video.pubkey}
                    />
                    <FollowButton pubkey={video.pubkey} />
                  </div>
                </div>

                <Separator />

                {(video.dimensions || video.size > 0) && (
                  <div className="text-sm text-muted-foreground space-x-4">
                    {video.dimensions && <span>{video.dimensions}</span>}
                    {video.size > 0 && (
                      <span>{formatFileSize(video.size)}</span>
                    )}
                  </div>
                )}

                {video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {video.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-wrap">{video.description}</div>
              </div>
            </CardHeader>
          </Card>

          <div className="mt-6">
            <VideoComments videoId={video.id} authorPubkey={video.pubkey} />
          </div>
        </div>

        <div className="w-80">
          <VideoSuggestions currentVideoId={video.id} />
        </div>
      </div>
    </div>
  );
}

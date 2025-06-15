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
import { useEffect } from "react";
import { processEvent, VideoEvent } from "@/utils/video-event";
import { nip19 } from "nostr-tools";
import { EventPointer } from "nostr-tools/nip19";
import { Skeleton } from "@/components/ui/skeleton";
import { CollapsibleText } from "@/components/ui/collapsible-text";
import { AddToPlaylistButton } from "@/components/AddToPlaylistButton";
import { useAppContext } from "@/hooks/useAppContext";

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
  const { presetRelays = [] } = useAppContext();
  const { nevent } = useParams<{ nevent: string }>();
  const { nostr } = useNostr();
  const { id, relays, author, kind } = nip19.decode(nevent ?? "")
    .data as EventPointer;

  const fullRelays = [
    ...new Set([...(relays || []), ...presetRelays.map((r) => r.url)].map(r => r.replace(/\/$/,''))),
  ];

  const { data: video, isLoading } = useQuery<VideoEvent | null>({
    queryKey: ["video", nevent],
    queryFn: async ({ signal }) => {
      if (!nevent) return null;

      const events = await nostr.query(
        [
          {
            authors: author ? [author] : undefined,
            kinds: kind ? [kind] : undefined,
            ids: [id],
          },
        ],
        { signal, relays: fullRelays }
      );

      if (!events.length) return null;

      const event = events[0];
      const processedEvent = processEvent(event, relays || []);
      if (!processedEvent) return null;
      return processedEvent;
    },
  });

  const authorMeta = useAuthor(video?.pubkey || "");
  const metadata = authorMeta.data?.metadata;
  const authorName =
    metadata?.display_name ||
    metadata?.name ||
    video?.pubkey?.slice(0, 8) ||
    "";

  useEffect(() => {
    console.log(video);
  }, [video]);

  // Scroll to top when video is loaded
  useEffect(() => {
    if (video) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [video]);

  if (!isLoading && !video) {
    return <div>Video not found</div>;
  }

  return (
    <div className="sm:py-6">
      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-1">
          {isLoading ? (
            <Card>
              <CardContent className="p-0">
                <Skeleton className="w-full aspect-video" />
              </CardContent>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <Skeleton className="h-8 w-3/4" />
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-9 w-9 rounded-full" />
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-16" />
                      ))}
                    </div>
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <VideoPlayer
                  url={video?.url || ""}
                  mime={video?.mimeType || ""}
                  poster={video?.thumb || ""}
                  loop={[34236, 22].includes(video?.kind || 0)}
                  className="w-full aspect-video"
                />
              </CardContent>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <h1 className="text-2xl font-bold">{video?.title}</h1>

                  <div className="flex items-start justify-between">
                    <Link
                      to={`/author/${nip19.npubEncode(video?.pubkey || "")}`}
                      className="flex items-center gap-4 hover:bg-accent p-2 rounded-lg transition-colors"
                    >
                      <Avatar>
                        <AvatarImage src={metadata?.picture} />
                        <AvatarFallback>{authorName[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">{authorName}</div>
                        <div className="text-sm text-muted-foreground">
                          {video?.created_at &&
                            formatDistance(
                              new Date(video.created_at * 1000),
                              new Date(),
                              { addSuffix: true }
                            )}
                        </div>
                      </div>
                    </Link>

                    {video && (
                      <div className="flex items-center gap-2">
                        <AddToPlaylistButton
                          videoId={video.id}
                          videoTitle={video.title}
                        />
                        <ButtonWithReactions
                          eventId={video.id}
                          authorPubkey={video.pubkey}
                        />
                        <FollowButton pubkey={video.pubkey} />
                      </div>
                    )}
                  </div>

                  <Separator />

                  {video &&
                    (video.dimensions || (video.size && video.size > 0)) && (
                      <div className="text-sm text-muted-foreground space-x-4">
                        {video.dimensions && <span>{video.dimensions}</span>}
                        {video.size && video.size > 0 && (
                          <span>{formatFileSize(video.size)}</span>
                        )}
                      </div>
                    )}

                  {video && video.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {video.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {video?.description && (
                    <CollapsibleText
                      text={video.description}
                      className="text-muted-foreground"
                    />
                  )}
                </div>
              </CardHeader>
            </Card>
          )}

          {video && (
            <div className="mt-6">
              <VideoComments videoId={video.id} authorPubkey={video.pubkey} />
            </div>
          )}
        </div>

        <div className="w-full lg:w-80">
          {video && (
            <VideoSuggestions
              currentVideoId={video.id}
              relays={fullRelays || []}
              authorPubkey={video.pubkey}
            />
          )}
        </div>
      </div>
    </div>
  );
}

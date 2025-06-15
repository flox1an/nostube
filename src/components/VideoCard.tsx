import { Link } from "react-router-dom";
import { useAuthor } from "@/hooks/useAuthor";
import { formatDistance } from "date-fns";
import { VideoEvent } from "@/utils/video-event";
import { nip19 } from "nostr-tools";
import { formatDuration } from "../lib/formatDuration";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface VideoCardProps {
  video: VideoEvent;
  hideAuthor?: boolean;
  format: "vertical" | "horizontal" | "square";
}

export function VideoCard({
  video,
  hideAuthor,
  format = "square",
}: VideoCardProps) {
  const author = useAuthor(video.pubkey);
  const metadata = author.data?.metadata;
  const name =
    metadata?.display_name || metadata?.name || video?.pubkey.slice(0, 8);

  const aspectRatio =
    format == "vertical"
      ? "aspect-[9/16]"
      : format == "square"
      ? "aspect-[1/1]"
      : "aspect-video";
  const maxWidth = format == "vertical" && "sm:max-w-[280px] mx-auto";
  
  return (
    <div className={cn("transition-all duration-200", maxWidth)}>
      <div className="p-0">
        <Link to={`/video/${video.link}`}>
          <div className="relative">
            <img
              loading="lazy"
              src={video.thumb}
              alt={video.title}
              className={cn("w-full object-cover rounded-lg", aspectRatio)}
            />
            {video.duration > 0 && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white px-1 rounded text-sm">
                {formatDuration(video.duration)}
              </div>
            )}
          </div>
        </Link>
        <div className="py-3">
          <div className="flex gap-3">
            {!hideAuthor && (
              <Link
                to={`/author/${nip19.npubEncode(video.pubkey)}`}
                className="shrink-0"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={author.data?.metadata?.picture}
                    alt={name}
                  />
                  <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                </Avatar>
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <Link to={`/video/${video.link}`}>
                <h3 className="font-medium line-clamp-2">{video.title}</h3>
              </Link>

              {!hideAuthor && (
                <Link
                  to={`/author/${nip19.npubEncode(video.pubkey)}`}
                  className="block text-sm mt-1 text-muted-foreground hover:text-primary"
                >
                  {name}
                </Link>
              )}

              <div className="text-sm text-muted-foreground">
                {formatDistance(new Date(video.created_at * 1000), new Date(), {
                  addSuffix: true,
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VideoCardSkeletonProps {
  format: "vertical" | "horizontal" | "square";
}

export function VideoCardSkeleton({ format }: VideoCardSkeletonProps) {
  const aspectRatio =
    format == "vertical"
      ? "aspect-[9/16]"
      : format == "square"
      ? "aspect-[1/1]"
      : "aspect-video";
  return (
    <Card>
      <CardContent className="p-0">
        <Skeleton className={cn("w-full", aspectRatio)} />
        <div className="p-4 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </CardContent>
    </Card>
  );
}

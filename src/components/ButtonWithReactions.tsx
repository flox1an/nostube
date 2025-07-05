import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HeartIcon } from "lucide-react";
import { cn, nowInSecs } from "@/lib/utils";
import { NostrEvent } from "nostr-tools";
import { useAppContext } from "@/hooks/useAppContext";

interface ButtonWithReactionsProps {
  eventId: string;
  kind: number;
  authorPubkey: string;
  className?: string;
}

export function ButtonWithReactions({
  eventId,
  kind,
  authorPubkey,
  className,
}: ButtonWithReactionsProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publish } = useNostrPublish();
  const queryClient = useQueryClient();
  const { config } = useAppContext();

  // Query to get reactions
  const { data: reactions = [], refetch: refetchReactions } = useQuery({
    queryKey: ["reactions", eventId],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [7], // NIP-25 reactions
            "#e": [eventId],
          },
        ],
        { signal, relays: config.relays }
      );
      return events;
    },
  });

  // Check if current user has liked
  const hasLiked =
    user &&
    reactions.some(
      (event) => event.pubkey === user.pubkey && event.content === "+"
    );

  // Count likes
  const likeCount = reactions.filter((event) => event.content === "+").length;

  const handleLike = () => {
    if (!user) return;

    // If already liked, we'll unlike by doing nothing (as reactions are ephemeral)
    if (!hasLiked) {
      publish(
        {
          event: {
            kind: 7,
            created_at: nowInSecs(),
            content: "+",
            tags: [
              ["e", eventId],
              ["p", authorPubkey],
              ["k", `${kind}`],
            ],
          },
        },
        {
          onSuccess: (publishedEvent: NostrEvent) => {
            queryClient.setQueryData(
              ["reactions", eventId],
              (old: NostrEvent[]) => [...old, publishedEvent]
            );
          },
        }
      );
    }

    // Refetch reactions to update the UI
    setTimeout(() => {
      refetchReactions();
    }, 1000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn("space-x-2", className)}
          onClick={handleLike}
          disabled={!user}
        >
          <HeartIcon
            className={cn(
              "h-5 w-5",
              hasLiked ? "fill-red-500 stroke-red-500" : "fill-none"
            )}
          />
          <span>{likeCount}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {user ? (hasLiked ? "Unlike" : "Like") : "Login to like"}
      </TooltipContent>
    </Tooltip>
  );
}

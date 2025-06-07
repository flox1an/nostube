import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserPlusIcon, UserCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface FollowButtonProps {
  pubkey: string;
  className?: string;
}

export function FollowButton({ pubkey, className }: FollowButtonProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publish } = useNostrPublish();

  // Query to get user's contact list
  const { data: followList, refetch: refetchFollows } = useQuery({
    queryKey: ["contacts", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;

      const events = await nostr.query(
        [
          {
            kinds: [3], // NIP-02 contacts
            authors: [user.pubkey],
            limit: 1,
          },
        ],
        { signal }
      );

      if (!events.length) return null;

      // Parse the tags to get the list of followed pubkeys
      return events[0].tags
        .filter((tag) => tag[0] === "p")
        .map((tag) => tag[1]);
    },
    enabled: !!user,
  });

  const isFollowing = followList?.includes(pubkey);

  const handleFollow = async () => {
    if (!user) return;

    // Get the current contact list event
    const currentList = await nostr.query(
      [
        {
          kinds: [3],
          authors: [user.pubkey],
          limit: 1,
        },
      ],
      {}
    );

    // Prepare the new contact list
    let tags: string[][] = [];

    if (currentList.length > 0) {
      // Start with existing tags
      tags = currentList[0].tags.filter(
        (tag) => tag[0] === "p" && tag[1] !== pubkey // Remove the target pubkey if it exists
      );
    }

    // Add the new pubkey if we're following
    if (!isFollowing) {
      tags.push(["p", pubkey]);
    }

    // Publish the new contact list
    publish({
      kind: 3,
      content: "", // Content can be empty for contact lists
      tags,
    });

    // Refetch the follow list to update UI
    setTimeout(() => {
      refetchFollows();
    }, 1000);
  };

  useEffect(() => {
    console.log(followList);
  }, []);

  if (!user || user.pubkey === pubkey) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isFollowing ? "secondary" : "default"}
          size="sm"
          className={cn("space-x-2", className)}
          onClick={handleFollow}
        >
          {isFollowing ? (
            <>
              <UserCheckIcon className="h-5 w-5" />
              <span>Following</span>
            </>
          ) : (
            <>
              <UserPlusIcon className="h-5 w-5" />
              <span>Follow</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isFollowing ? "Unfollow" : "Follow"}</TooltipContent>
    </Tooltip>
  );
}

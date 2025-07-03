import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";

export function useFollowedAuthors() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useQuery<string[]>({
    queryKey: ["followedAuthors", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];

      const events = await nostr.query(
        [
          {
            kinds: [3], // Kind 3 is for contact lists
            authors: [user.pubkey],
            limit: 1,
          },
        ],
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
          relays: config.relays,
        }
      );

      if (!events.length) return [];

      const contactList = events[0];
      const followedPubkeys: string[] = contactList.tags
        .filter((tag) => tag[0] === "p" && tag[1])
        .map((tag) => tag[1]);

      return followedPubkeys;
    },
    enabled: !!user?.pubkey,
  });
}

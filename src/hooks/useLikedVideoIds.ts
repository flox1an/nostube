import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";

export function useLikedVideoIds() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  return useQuery<string[]> ({
    queryKey: ['likedVideoIds', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) {
        return [];
      }

      const likedEvents = await nostr.query(
        [{
          kinds: [7],
          authors: [user.pubkey],
        }],
        { signal }
      );

      const videoIds = likedEvents
        .filter(event => event.content === '+')
        .map(event => {
          const eTag = event.tags.find(tag => tag[0] === 'e');
          return eTag ? eTag[1] : undefined;
        })
        .filter((id): id is string => id !== undefined);

      return videoIds;
    },
    enabled: !!user,
  });
} 
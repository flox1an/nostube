import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@/hooks/useNostr';
import { useQuery } from '@tanstack/react-query';

export function useUserBlossomServers() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: ['blossom-servers', user?.pubkey],
    enabled: !!user?.pubkey,
    queryFn: async (ctx) => {
      if (!user?.pubkey) return [];
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(3000)]);
      const events = await nostr.query([
        {
          kinds: [10063],
          authors: [user.pubkey],
          limit: 1,
        },
      ], { signal });
      if (!events.length) return [];
      // Use the most recent event
      const event = events[0];
      // Extract all 'r' tags
      return event.tags.filter(tag => (tag[0] === 'r' || tag[0]=='server') && tag[1]).map(tag => tag[1]);
    },
    staleTime: 60_000,
  });
} 
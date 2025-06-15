import React, { useEffect, useRef } from 'react';
import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

interface NostrProviderProps {
  children: React.ReactNode;
  relayUrl: string;
  presetRelays?: { name: string; url: string }[];
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children, relayUrl, presetRelays } = props;

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const currentRelayUrl = useRef<string>(relayUrl);

  // Update refs when config changes
  useEffect(() => {
    currentRelayUrl.current = relayUrl;
    queryClient.resetQueries();
  }, [relayUrl, queryClient]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        return new Map([[currentRelayUrl.current, filters]]);
      },
      eventRouter(_event: NostrEvent) {
        // Publish to the selected relay
        const allRelays = new Set<string>([currentRelayUrl.current]);

        // Also publish to the preset relays, capped to 5
        for (const { url } of (presetRelays ?? [])) {
          allRelays.add(url);

          if (allRelays.size >= 5) {
            break;
          }
        }

        return [...allRelays];
      },
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
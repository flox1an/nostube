import { useEffect } from 'react';
import { useAppContext } from './useAppContext';
import { updateRelayPool } from '@/nostr/core';

export function useRelaySync() {
  const { config } = useAppContext();

  useEffect(() => {
    // Get read relays from user config
    const readRelays = config.relays
      .filter(r => r.tags.includes('read'))
      .map(r => r.url);

    console.log('useRelaySync: Updating relay pool with:', readRelays);

    // Update the relay pool with user's configured relays
    if (readRelays.length > 0) {
      updateRelayPool(readRelays);
    }
  }, [config.relays]);
}

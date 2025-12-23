import { useEffect } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useAppContext } from './useAppContext'
import type { NostrEvent } from 'nostr-tools'

/**
 * Hook to load an author's NIP-65 relay list (kind 10002) from the network.
 *
 * This hook fetches the author's relay list using a broad set of discovery relays
 * and adds it to the EventStore. The EventStore will handle deduplication.
 *
 * @param pubkey - The author's public key
 * @param discoveryRelays - Relays to use for discovering the relay list
 */
export function useLoadAuthorRelayList(pubkey: string | undefined, discoveryRelays: string[]) {
  const { pool } = useAppContext()
  const eventStore = useEventStore()

  useEffect(() => {
    if (!pubkey || discoveryRelays.length === 0) return

    // Check if we already have the relay list in the store
    if (eventStore.hasReplaceable(10002, pubkey)) {
      return
    }

    // Subscribe to relay list events from the network
    const sub = pool
      .subscription(discoveryRelays, [
        {
          kinds: [10002],
          authors: [pubkey],
          limit: 1,
        },
      ])
      .subscribe({
        next: (event: unknown) => {
          // Filter out EOSE messages
          if (
            typeof event === 'string' ||
            typeof event !== 'object' ||
            event === null ||
            !('kind' in event)
          ) {
            return
          }

          // Add to EventStore (it will handle deduplication)
          eventStore.add(event as NostrEvent)
        },
        error: (err: unknown) => {
          console.warn('[useLoadAuthorRelayList] Failed to load relay list:', err)
        },
      })

    return () => sub.unsubscribe()
  }, [pubkey, discoveryRelays, pool, eventStore])
}

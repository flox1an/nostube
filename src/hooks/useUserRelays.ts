import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { NostrEvent } from 'nostr-tools'
import { useMemo } from 'react'

interface RelayInfo {
  url: string
  read: boolean
  write: boolean
}

/**
 * Hook to read a user's NIP-65 relay list metadata.
 * @param pubkey The public key of the user.
 * @returns A query result containing the user's relay list.
 */
export function useUserRelays(pubkey: string | undefined) {
  const eventStore = useEventStore()

  // Use EventStore to get user's relay list (kind 10002)
  const relayListObservable = eventStore.timeline([
    {
      kinds: [10002],
      authors: pubkey ? [pubkey] : [],
      limit: 1,
    },
  ])

  const relayListEvents = useObservableState(relayListObservable, [])

  const relayInfo = useMemo(() => {
    if (!pubkey || relayListEvents.length === 0) return []

    const relayListEvent: NostrEvent = relayListEvents[0]
    const relays: RelayInfo[] = []

    for (const tag of relayListEvent.tags) {
      if (tag[0] === 'r' && tag[1]) {
        const url = tag[1]
        const read = tag[2] === 'read' || tag[2] === undefined // Default to read if no marker
        const write = tag[2] === 'write' || tag[2] === undefined // Default to write if no marker
        relays.push({ url, read, write })
      }
    }

    return relays
  }, [pubkey, relayListEvents])

  return {
    data: relayInfo,
    isLoading: pubkey && relayListEvents.length === 0,
    enabled: !!pubkey,
  }
}

import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { type NostrEvent } from 'nostr-tools'
import { useEffect, useMemo } from 'react'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY, presetRelays, INDEXER_RELAYS } from '@/constants/relays'

export interface UserRelayInfo {
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
  const { pool, config } = useAppContext()

  // Use EventStore to get user's relay list (kind 10002)
  const relayListObservable = eventStore.timeline([
    {
      kinds: [10002],
      authors: pubkey ? [pubkey] : [],
      limit: 1,
    },
  ])

  const relayListEvents = useObservableState(relayListObservable, [])

  const discoveryRelays = useMemo(() => {
    const urls = new Set<string>()
    config.relays.forEach(relay => urls.add(relay.url))
    presetRelays.forEach(relay => urls.add(relay.url))
    urls.add(METADATA_RELAY)
    // Include indexer relays for better NIP-65 discovery in incognito mode
    INDEXER_RELAYS.forEach(url => urls.add(url))
    return Array.from(urls)
  }, [config.relays])

  useEffect(() => {
    if (!pubkey || discoveryRelays.length === 0) return
    if (eventStore.hasReplaceable(10002, pubkey)) {
      return
    }

    const loader = createTimelineLoader(
      pool,
      discoveryRelays,
      {
        kinds: [10002],
        authors: [pubkey],
        limit: 1,
      },
      {
        eventStore,
        limit: 1,
      }
    )

    const subscription = loader().subscribe({
      next: event => {
        eventStore.add(event)
      },
      error: err => {
        console.warn('[useUserRelays] Failed to load relay list:', err)
      },
    })

    return () => subscription.unsubscribe()
  }, [pubkey, discoveryRelays, pool, eventStore])

  const relayInfo: UserRelayInfo[] = useMemo(() => {
    if (!pubkey || relayListEvents.length === 0) return []

    const relayListEvent: NostrEvent = relayListEvents[0]
    const relays: UserRelayInfo[] = []

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

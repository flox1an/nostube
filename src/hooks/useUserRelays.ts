import { type NostrEvent } from 'nostr-tools'
import { useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY, presetRelays, INDEXER_RELAYS } from '@/constants/relays'
import { useNostrQueryFirst } from '@/nostr/useNostrQuery'

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
  const { config } = useAppContext()

  const filters = useMemo(
    () => (pubkey ? { kinds: [10002], authors: [pubkey], limit: 1 } : null),
    [pubkey]
  )

  const discoveryRelays = useMemo(() => {
    const urls = new Set<string>()
    config.relays.forEach(relay => urls.add(relay.url))
    presetRelays.forEach(relay => urls.add(relay.url))
    urls.add(METADATA_RELAY)
    INDEXER_RELAYS.forEach(url => urls.add(url))
    return Array.from(urls)
  }, [config.relays])

  const { event: relayListEvent, isLoading } = useNostrQueryFirst(filters, {
    relays: discoveryRelays,
  })

  const relayInfo: UserRelayInfo[] = useMemo(() => {
    if (!pubkey || !relayListEvent) return []

    const event: NostrEvent = relayListEvent
    const relays: UserRelayInfo[] = []

    for (const tag of event.tags) {
      if (tag[0] === 'r' && tag[1]) {
        const url = tag[1]
        const read = tag[2] === 'read' || tag[2] === undefined
        const write = tag[2] === 'write' || tag[2] === undefined
        relays.push({ url, read, write })
      }
    }

    return relays
  }, [pubkey, relayListEvent])

  return {
    data: relayInfo,
    isLoading: pubkey ? isLoading : false,
    enabled: !!pubkey,
  }
}

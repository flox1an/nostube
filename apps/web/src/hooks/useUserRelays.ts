import { type NostrEvent } from 'nostr-tools'
import { useCallback, useMemo } from 'react'
import { lastValueFrom, tap } from 'rxjs'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useAppContext } from './useAppContext'
import { METADATA_RELAYS, presetRelays, INDEXER_RELAYS } from '@/constants/relays'
import { useNostrQueryFirst } from '@/nostr/useNostrQuery'
import { getTimelineLoader } from '@/nostr/core'

export interface UserRelayInfo {
  url: string
  read: boolean
  write: boolean
}

/** Relays asked for a NIP-65 relay list: configured, preset, metadata and indexer relays. */
function discoveryRelaysFor(configRelays: { url: string }[]): string[] {
  const urls = new Set<string>()
  configRelays.forEach(relay => urls.add(relay.url))
  presetRelays.forEach(relay => urls.add(relay.url))
  METADATA_RELAYS.forEach(url => urls.add(url))
  INDEXER_RELAYS.forEach(url => urls.add(url))
  return Array.from(urls)
}

function parseRelayList(event: NostrEvent | undefined): UserRelayInfo[] {
  if (!event) return []
  const relays: UserRelayInfo[] = []
  for (const tag of event.tags) {
    if (tag[0] === 'r' && tag[1]) {
      const read = tag[2] === 'read' || tag[2] === undefined
      const write = tag[2] === 'write' || tag[2] === undefined
      relays.push({ url: tag[1], read, write })
    }
  }
  return relays
}

// Concurrent actions for one author (double click, reaction + zap) share a single lookup, per
// store and discovery relay set. Entries only live while the request is in flight.
const authorRelayLookups = new WeakMap<object, Map<string, Promise<unknown>>>()

/**
 * Publish destinations for an interaction with `pubkey`'s content: relays `target` was seen on,
 * the author's NIP-65 relays (read and write: where they check mentions) and our write relays.
 * The author's relay list is fetched here, on an intentional action, never while browsing; a
 * relay list already in the store is reused. A failed lookup only drops the author's relays.
 */
export function useInteractionRelays() {
  const { config } = useAppContext()
  const eventStore = useEventStore()

  return useCallback(
    async (pubkey: string | undefined, target?: NostrEvent): Promise<string[]> => {
      if (pubkey && !eventStore.getReplaceable(10002, pubkey)) {
        const relays = discoveryRelaysFor(config.relays)
        const key = `${pubkey}|${relays.join(',')}`
        let lookups = authorRelayLookups.get(eventStore)
        if (!lookups) authorRelayLookups.set(eventStore, (lookups = new Map()))
        let lookup = lookups.get(key)
        if (!lookup) {
          const loader = getTimelineLoader(
            `relays:${key}`,
            { kinds: [10002], authors: [pubkey], limit: 1 },
            relays
          )
          // ponytail: waits for every discovery relay (EOSE or 8s idle timeout) so the newest
          // list wins; resolve on first event if first-click latency matters more.
          const scope = lookups
          lookup = lastValueFrom(loader().pipe(tap(event => eventStore.add(event))), {
            defaultValue: undefined,
          })
            .catch(err =>
              console.warn('[useInteractionRelays] Author relay list lookup failed:', err)
            )
            .finally(() => scope.delete(key))
          lookups.set(key, lookup)
        }
        await lookup
      }

      const seenRelays = target ? Array.from(getSeenRelays(target) || []) : []
      const authorRelays = parseRelayList(
        pubkey ? eventStore.getReplaceable(10002, pubkey) : undefined
      )
        .filter(r => r.read || r.write)
        .map(r => r.url)
      const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
      return Array.from(new Set([...seenRelays, ...authorRelays, ...writeRelays]))
    },
    [config.relays, eventStore]
  )
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

  const discoveryRelays = useMemo(() => discoveryRelaysFor(config.relays), [config.relays])

  const { event: relayListEvent, isLoading } = useNostrQueryFirst(filters, {
    relays: discoveryRelays,
  })

  const relayInfo: UserRelayInfo[] = useMemo(
    () => (pubkey && relayListEvent ? parseRelayList(relayListEvent) : []),
    [pubkey, relayListEvent]
  )

  return {
    data: relayInfo,
    isLoading: pubkey ? isLoading : false,
    enabled: !!pubkey,
  }
}

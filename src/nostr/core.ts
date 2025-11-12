import { EventStore } from 'applesauce-core'
import { RelayPool } from 'applesauce-relay'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import type { Filter, NostrEvent } from 'nostr-tools'
import { openDB, getEventsForFilters, addEvents, NostrIDB } from 'nostr-idb'
import { presistEventsToCache } from 'applesauce-core/helpers'
import { NostrConnectSigner } from 'applesauce-signers'
import type { NostrSubscriptionMethod, NostrPublishMethod } from 'applesauce-signers'
import { filter } from 'rxjs'
import { presetRelays } from '@/constants/relays'

// Setup a local event

let cache: NostrIDB | undefined

async function ensureCache() {
  if (!cache) {
    cache = await openDB()
  }
  return cache
}
ensureCache()

export async function cacheRequest(filters: Filter[]) {
  const cache = await ensureCache()
  return getEventsForFilters(cache, filters)
}

// Initialize EventStore
export const eventStore = new EventStore()
export const relayPool = new RelayPool()

// Save all new events to the cache
presistEventsToCache(eventStore, events => addEvents(cache!, events))

// Configure NostrConnectSigner with relay pool methods
// This is required for NIP-46 bunker:// URI login to work
const subscriptionMethod: NostrSubscriptionMethod = (relays: string[], filters: Filter[]) => {
  return relayPool
    .subscription(relays, filters)
    .pipe(
      filter(
        (response): response is NostrEvent => typeof response !== 'string' && 'kind' in response
      )
    )
}

const publishMethod: NostrPublishMethod = async (relays: string[], event: NostrEvent) => {
  const results = await relayPool.publish(relays, event)
  return results
}

// Set global methods for NostrConnectSigner
NostrConnectSigner.subscriptionMethod = subscriptionMethod
NostrConnectSigner.publishMethod = publishMethod

// Default relays for video content - these will be overridden by user config
export const DEFAULT_RELAYS = presetRelays.map(r => r.url)

// ---- loader factory ----
//
// Each distinct filter set gets its own loader instance (thus own cursor).
// We share store/pool to avoid duplicate connections/subs.
type FilterKey = string

export function getTimelineLoader(
  key: FilterKey,
  baseFilters: Filter,
  relays: string[] = DEFAULT_RELAYS
) {
  const loader = createTimelineLoader(relayPool, relays, baseFilters, {
    eventStore,
    cache: cacheRequest, // cache-first
    limit: 50,
    timeout: 5000, // 5 second timeout per relay
  })
  return loader
}

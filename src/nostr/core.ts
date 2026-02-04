import { EventStore } from 'applesauce-core'
import { RelayPool } from 'applesauce-relay'
import { createTimelineLoader, createEventLoaderForStore } from 'applesauce-loaders/loaders'
import type { Filter, NostrEvent } from 'nostr-tools'
import { openDB, getEventsForFilters, addEvents } from 'nostr-idb'
import type { IDBPDatabase } from 'idb'
import { presistEventsToCache } from 'applesauce-core/helpers'
import { NostrConnectSigner } from 'applesauce-signers'
import type { NostrSubscriptionMethod, NostrPublishMethod } from 'applesauce-signers'
import { filter, mergeMap, race, throwError, timer } from 'rxjs'
import { presetRelays } from '@/constants/relays'

// Default relays for video content - these will be overridden by user config
export const DEFAULT_RELAYS = presetRelays.map(r => r.url)

// Setup a local event

let cache: IDBPDatabase<any> | undefined

async function ensureCache() {
  if (!cache) {
    cache = await openDB()
  }
  return cache
}
ensureCache()

export async function cacheRequest(filters: Filter[]) {
  try {
    const cache = await ensureCache()
    return getEventsForFilters(cache, filters)
  } catch (error) {
    console.warn('Cache unavailable (possibly iOS lockdown mode):', error)
    return [] // Return empty array to continue with relay fetching
  }
}

// Initialize EventStore
export const eventStore = new EventStore()
export const relayPool = new RelayPool()

const REQUEST_TIMEOUT_MS = 5000
const originalRequest = relayPool.request.bind(relayPool)

relayPool.request = ((relays, filters, opts) => {
  const timeout$ = timer(REQUEST_TIMEOUT_MS).pipe(
    mergeMap(() =>
      throwError(() => new Error(`Relay request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    )
  )
  return race(originalRequest(relays, filters, opts), timeout$)
}) as typeof relayPool.request

// Configure unified event loader for all pointer types
// Handles both EventPointer (by id) and AddressPointer (by kind/pubkey/d-tag)
// This includes kind 10063 (blossom servers), kind 10002 (relay lists), profiles, etc.
createEventLoaderForStore(eventStore, relayPool, {
  cacheRequest,
  lookupRelays: DEFAULT_RELAYS,
  bufferTime: 0, // Don't batch - emit first result immediately
  followRelayHints: true,
})

console.log('📡 Configured unified EventStore loader with relays:', DEFAULT_RELAYS)

// Save all new events to the cache
presistEventsToCache(eventStore, events => addEvents(cache!, events))

// Configure NostrConnectSigner with relay pool methods
// This is required for NIP-46 bunker:// URI login to work
// Also exported for use by applesauce-wallet-connect
export const subscriptionMethod: NostrSubscriptionMethod = (
  relays: string[],
  filters: Filter[]
) => {
  return relayPool
    .subscription(relays, filters)
    .pipe(
      filter(
        (response): response is NostrEvent => typeof response !== 'string' && 'kind' in response
      )
    )
}

export const publishMethod: NostrPublishMethod = async (relays: string[], event: NostrEvent) => {
  const results = await relayPool.publish(relays, event)
  return results
}

// Set global methods for NostrConnectSigner
NostrConnectSigner.subscriptionMethod = subscriptionMethod
NostrConnectSigner.publishMethod = publishMethod

// ---- loader factory ----
//
// Each distinct filter set gets its own loader instance (thus own cursor).
// We share store/pool to avoid duplicate connections/subs.
type FilterKey = string

export function getTimelineLoader(
  _key: FilterKey,
  baseFilters: Filter,
  relays: string[] = DEFAULT_RELAYS
) {
  const loader = createTimelineLoader(relayPool, relays, baseFilters, {
    eventStore,
    cache: cacheRequest, // cache-first
    limit: 50,
  })
  return loader
}

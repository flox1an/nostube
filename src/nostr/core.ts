import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { createTimelineLoader } from 'applesauce-loaders/loaders';
import type { Filter } from 'nostr-tools';
import { openDB, getEventsForFilters, addEvents, NostrIDB } from 'nostr-idb';
import { presistEventsToCache } from 'applesauce-core/helpers';

// Setup a local event 

let cache: NostrIDB|undefined;

async function ensureCache() {
  if (!cache) {
    cache = await openDB();
  }
  return cache;
}
ensureCache();


export async function cacheRequest(filters: Filter[]) {
  const cache = await ensureCache();
  return getEventsForFilters(cache, filters).then(events => {
    console.log('loaded events from cache', events.length);
    return events;
  });
}

// Initialize EventStore
export const eventStore = new EventStore();
export const relayPool = new RelayPool();

// Save all new events to the cache
presistEventsToCache(eventStore, events => addEvents(cache!, events));

// Default relays for video content - these will be overridden by user config
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];

// Function to update relays from user config
export function updateRelayPool(relayUrls: string[]) {
  // The RelayPool will automatically connect to the relays specified in the loader
  console.log('Relay pool would be updated with:', relayUrls);
}

// ---- loader factory + memoization by "key" ----
//
// Each distinct filter set gets its own loader instance (thus own cursor).
// We share store/pool to avoid duplicate connections/subs.
type FilterKey = string;
//const loaderMemo = new Map<FilterKey, ReturnType<typeof createTimelineLoader>>();

export function getTimelineLoader(key: FilterKey, baseFilters: Filter, relays: string[] = DEFAULT_RELAYS) {
  // if (loaderMemo.has(key)) return loaderMemo.get(key)!;

  const loader = createTimelineLoader(relayPool, relays, baseFilters, {
    eventStore,
    cache: cacheRequest, // cache-first
    limit: 50,
  });
  console.log('getTimelineLoader: created new loader for', key, loader);
  // loaderMemo.set(key, loader);
  return loader;
}


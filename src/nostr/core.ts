import { EventStore } from "applesauce-core";
import { RelayPool } from "applesauce-relay";
import { createTimelineLoader } from "applesauce-loaders/loaders";
import { getKindsForType } from '@/lib/video-types';
import { VideoType } from '@/contexts/AppContext';
import type { Filter } from 'nostr-tools';
import { openDB, getEventsForFilters, addEvents } from "nostr-idb";
import {
  presistEventsToCache,
} from "applesauce-core/helpers";

// ---- cache (optional, but great for not re-hitting relays) ----
let dbPromise: Promise<Awaited<ReturnType<typeof openDB>> | null> | null = null;
const cacheDB = () => (dbPromise ??= openDB().catch(() => null));

// Setup a local event cache
const cache = await openDB();
export async function cacheRequest(filters: Filter[]) {
  return getEventsForFilters(cache, filters).then((events) => {
    console.log("loaded events from cache", events.length);
    return events;
  });
}

// Initialize EventStore
export const eventStore = new EventStore();
export const relayPool = new RelayPool();

// Save all new events to the cache
presistEventsToCache(eventStore, (events) => addEvents(cache, events));

// Function to manually store events in IDB
export async function storeEventInIDB(event: { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][]; sig: string }) {
  try {
    const db = await cacheDB();
    if (db) {
      await addEvents(db, [event]);
    }
  } catch (error) {
    console.warn('Failed to store event in IDB:', error);
  }
}


// Default relays for video content - these will be overridden by user config
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

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
const loaderMemo = new Map<FilterKey, ReturnType<typeof createTimelineLoader>>();

export function getTimelineLoader(
  key: FilterKey,
  baseFilters: Filter,
  relays: string[] = DEFAULT_RELAYS
) {
  if (loaderMemo.has(key)) return loaderMemo.get(key)!;

  const loader = createTimelineLoader(relayPool, relays, baseFilters, {
    eventStore,
    cache: cacheRequest, // cache-first
    limit: 50,
  });

  loaderMemo.set(key, loader);
  return loader;
}

// ---- "named" loaders for common feeds ----

// Kind 21 (videos)
export const videoLoader = () =>
  getTimelineLoader("k21", { kinds: getKindsForType('videos') });

// Kind 22 (shorts)
export const shortsLoader = () =>
  getTimelineLoader("k22", { kinds: getKindsForType('shorts') });

// Combined 21+22 (all video content)
export const allVideoLoader = () =>
  getTimelineLoader("k21k22", { kinds: getKindsForType('all') });

// By author (pubkey hex)
export const authorVideoLoader = (pubkey: string) =>
  getTimelineLoader(`k21:author:${pubkey}`, { kinds: getKindsForType('all'), authors: [pubkey] });

// By video type
export const videoTypeLoader = (type: VideoType) =>
  getTimelineLoader(`k21:type:${type}`, { kinds: getKindsForType(type) });

// By video type and author
export const authorVideoTypeLoader = (type: VideoType, pubkey: string) =>
  getTimelineLoader(`k21:type:${type}:author:${pubkey}`, { kinds: getKindsForType(type), authors: [pubkey] });

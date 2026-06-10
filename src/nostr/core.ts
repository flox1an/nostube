import { EventStore } from 'applesauce-core'
import { RelayPool } from 'applesauce-relay'
import {
  createEventLoaderForStore,
  loadBlocksFromFilterMap,
  loadBlocksFromCache,
  type TimelineLoader,
} from 'applesauce-loaders/loaders'
import type { Filter, NostrEvent } from 'nostr-tools'
import { openDB, getEventsForFilters, addEvents } from 'nostr-idb'
import type { NostrIDBDatabase } from 'nostr-idb/database'
import { presistEventsToCache } from 'applesauce-core/helpers'
import { NostrConnectSigner } from 'applesauce-signers'
import type { NostrSubscriptionMethod, NostrPublishMethod } from 'applesauce-signers'
import { BehaviorSubject, Observable, merge, share, EMPTY, filter } from 'rxjs'
import { filterDuplicateEvents } from 'applesauce-core/observable'
import { presetRelays } from '@/constants/relays'
import { lastLoadedTimestamp } from '@/lib/video-timeline-cache'

// Default relays for video content - these will be overridden by user config
export const DEFAULT_RELAYS = presetRelays.map(r => r.url)

// Setup a local event

let cache: NostrIDBDatabase | undefined

async function ensureCache() {
  if (!cache) {
    cache = await openDB()
  }
  return cache
}
ensureCache()

export function resetNostrRuntimeCache() {
  eventStore.removeByFilters({})
  lastLoadedTimestamp.clear()

  for (const relay of [...relayPool.relays.keys()]) {
    relayPool.remove(relay)
  }

  cache?.close()
  cache = undefined
}

// Only return cached events whose created_at is within this window.
// Older events are ignored so timeline loaders always fetch fresh data from relays.
const CACHE_TTL_SECONDS = 4 * 60 * 60 // 4 hours

export async function cacheRequest(filters: Filter[]) {
  try {
    const cache = await ensureCache()
    const events = await getEventsForFilters(cache, filters)
    const cutoff = Math.floor(Date.now() / 1000) - CACHE_TTL_SECONDS
    return events.filter(e => e.created_at >= cutoff)
  } catch (error) {
    console.warn('Cache unavailable (possibly iOS lockdown mode):', error)
    return [] // Return empty array to continue with relay fetching
  }
}

// Initialize EventStore
export const eventStore = new EventStore()
export const relayPool = new RelayPool()

const REQUEST_IDLE_TIMEOUT_MS = 8000
const originalRequest = relayPool.request.bind(relayPool)

function withIdleTimeout<T>(source: Observable<T>, message: string): Observable<T> {
  return new Observable(observer => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    let sub: { unsubscribe: () => void } | null = null

    const clear = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
    }

    const reset = () => {
      clear()
      timeout = setTimeout(() => {
        sub?.unsubscribe()
        if (import.meta.env.DEV) {
          console.warn(message)
        }
        observer.complete()
      }, REQUEST_IDLE_TIMEOUT_MS)
    }

    reset()
    sub = source.subscribe({
      next: value => {
        reset()
        observer.next(value)
      },
      error: err => {
        clear()
        observer.error(err)
      },
      complete: () => {
        clear()
        observer.complete()
      },
    })

    return () => {
      clear()
      sub?.unsubscribe()
    }
  })
}

relayPool.request = ((relays, filters, opts) => {
  const relayList = Array.isArray(relays) ? relays : [relays]
  const timeoutMessage = `Relay request idle timed out after ${REQUEST_IDLE_TIMEOUT_MS}ms`

  if (import.meta.env.DEV) {
    const start = Date.now()
    console.log(`[relay] request to ${relayList.length} relay(s): ${JSON.stringify(relayList)}`)

    let eventCount = 0
    return withIdleTimeout(
      new Observable(observer => {
        const sub = originalRequest(relays, filters, opts).subscribe({
          next: event => {
            eventCount++
            if (eventCount === 1) {
              console.log(
                `[relay] ⚡ first event from relay in ${Date.now() - start}ms: ${JSON.stringify(relayList)}`
              )
            }
            observer.next(event)
          },
          error: err => {
            console.warn(
              `[relay] ❌ error after ${Date.now() - start}ms from: ${JSON.stringify(relayList)}`,
              err
            )
            observer.error(err)
          },
          complete: () => {
            console.log(
              `[relay] ✅ complete after ${Date.now() - start}ms, ${eventCount} events from: ${JSON.stringify(relayList)}`
            )
            observer.complete()
          },
        })
        return () => sub.unsubscribe()
      }),
      `${timeoutMessage} for relays: ${JSON.stringify(relayList)}`
    )
  }
  return withIdleTimeout(
    originalRequest(relays, filters, opts),
    `${timeoutMessage} for relays: ${JSON.stringify(relayList)}`
  )
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
  relays: string[] = DEFAULT_RELAYS,
  options?: { skipCache?: boolean }
): TimelineLoader {
  // Build a relay map so each relay gets its own independent backward cursor.
  // With createTimelineLoader all relays share one cursor: the global minimum
  // across all relays. This causes a gap when Relay A returns dense recent
  // events (shallow cursor) while Relay B has older events (deep cursor) —
  // Relay A's middle window gets permanently skipped on subsequent pages.
  const relayMap: Record<string, Filter> = Object.fromEntries(
    relays.map(relay => [relay, baseFilters])
  )

  const limit = baseFilters.limit ?? 100
  const window$ = new BehaviorSubject<{ since?: number; until?: number }>({})

  // Per-relay loading: each relay advances its own cursor independently
  const relays$ = window$.pipe(loadBlocksFromFilterMap(relayPool, relayMap, { limit }))

  // Cache loading: shared, timestamp-based (unchanged behaviour)
  const cache$ = options?.skipCache
    ? EMPTY
    : window$.pipe(loadBlocksFromCache(cacheRequest, baseFilters, { limit }))

  // Deduplicate via EventStore and share the subscription across all callers.
  // This mirrors the internals of the (unexported) wrapTimelineLoader helper.
  const singleton$ = merge(cache$, relays$).pipe(filterDuplicateEvents(eventStore), share())

  return (since?: number | { since?: number; until?: number }) =>
    new Observable(observer => {
      const sub = singleton$.subscribe(observer)
      if (typeof since === 'object' && since !== undefined) {
        window$.next(since)
      } else {
        window$.next({ since: since ?? -Infinity })
      }
      return () => sub.unsubscribe()
    })
}

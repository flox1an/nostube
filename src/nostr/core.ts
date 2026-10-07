import { EventStore } from 'applesauce-core'
import { RelayPool } from 'applesauce-relay'
import { createEventLoaderForStore } from 'applesauce-loaders/loaders'
import type { Filter, NostrEvent } from 'nostr-tools'
import { openDB, getEventsForFilters, addEvents, deleteEvent, deleteReplaceable } from 'nostr-idb'
import type { NostrIDBDatabase } from 'nostr-idb/database'
import { presistEventsToCache } from 'applesauce-core/helpers'
import { NostrConnectSigner } from 'applesauce-signers'
import type { NostrSubscriptionMethod, NostrPublishMethod } from 'applesauce-signers'
import {
  Observable,
  merge,
  EMPTY,
  filter,
  tap,
  from,
  mergeMap,
  catchError,
  finalize,
  defer,
  isObservable,
  map,
} from 'rxjs'
import { filterDuplicateEvents } from 'applesauce-core/observable'
import { presetRelays } from '@/constants/relays'
import { lastLoadedTimestamp } from '@/lib/video-timeline-cache'
import {
  getInstanceConfig,
  instanceRelays,
  isRelayAllowed,
  isVideoKind,
  scopeVideoRequest,
} from '@/lib/instance-config'

const instance = getInstanceConfig()

// Default relays for video content - these will be overridden by user config.
// Instance build: the interaction relays (publish fallback, lookups, wallet, DVM).
export const DEFAULT_RELAYS = instance ? instance.interactionRelays : presetRelays.map(r => r.url)

// Setup a local event

let cache: NostrIDBDatabase | undefined

async function ensureCache() {
  if (!cache) {
    cache = await openDB()
  }
  return cache
}
ensureCache()

function buildDeletionFilters(filters: Filter[]): Filter[] {
  return filters
    .filter(filter => !filter.kinds?.includes(5))
    .map(filter => ({
      kinds: [5],
      authors: filter.authors,
      since: filter.since,
      until: filter.until,
      limit: filter.limit,
    }))
}

function getDeleteCoordinates(event: NostrEvent) {
  return event.tags
    .filter(tag => tag[0] === 'a' && tag[1])
    .map(tag => {
      const [kind, pubkey, ...identifierParts] = tag[1].split(':')
      const parsedKind = Number(kind)
      const identifier = identifierParts.join(':')

      if (!Number.isInteger(parsedKind) || !pubkey) return undefined

      return { kind: parsedKind, pubkey, identifier }
    })
    .filter(
      (
        pointer
      ): pointer is {
        kind: number
        pubkey: string
        identifier: string
      } => pointer !== undefined
    )
}

async function applyDeletionEventsToCache(db: NostrIDBDatabase, events: NostrEvent[]) {
  const deletionEvents = events.filter(event => event.kind === 5)
  if (deletionEvents.length === 0) return

  await addEvents(db, deletionEvents)

  for (const deletionEvent of deletionEvents) {
    const deletedIds = deletionEvent.tags.filter(tag => tag[0] === 'e' && tag[1]).map(tag => tag[1])

    await Promise.all(deletedIds.map(id => deleteEvent(db, id)))

    const deletedCoordinates = getDeleteCoordinates(deletionEvent)
    await Promise.all(
      deletedCoordinates.map(pointer =>
        deleteReplaceable(db, pointer.pubkey, pointer.kind, pointer.identifier)
      )
    )
  }
}

async function persistEventsToLocalCache(db: NostrIDBDatabase, events: NostrEvent[]) {
  await applyDeletionEventsToCache(db, events)

  const nonDeletionEvents = events.filter(event => event.kind !== 5)
  if (nonDeletionEvents.length > 0) {
    await addEvents(db, nonDeletionEvents)
  }
}

export async function cacheEvents(events: NostrEvent[]) {
  const db = await ensureCache()
  await persistEventsToLocalCache(db, events)
}

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
    const events = await getEventsForFilters(cache, [...filters, ...buildDeletionFilters(filters)])
    const cutoff = Math.floor(Date.now() / 1000) - CACHE_TTL_SECONDS
    return events.filter(
      (event): event is NostrEvent =>
        event.created_at >= cutoff && 'sig' in event && typeof event.sig === 'string'
    )
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

if (instance) {
  // Instance build (nostube-server ADR 0005), enforced here once for every union site:
  // 1. the pool only connects to videoSources ∪ interactionRelays (hints, outbox, NIP-65,
  //    presets and the hardcoded relay constants are dropped);
  const group = relayPool.group.bind(relayPool)
  relayPool.group = ((relays, ignoreOffline) =>
    group(
      Array.isArray(relays)
        ? relays.filter(isRelayAllowed)
        : relays.pipe(map(urls => urls.filter(isRelayAllowed))),
      ignoreOffline
    )) as typeof relayPool.group

  // 2. video-kind requests only go to videoSources and only for creators; a request with
  //    nothing left in scope is not sent at all;
  for (const method of ['request', 'subscription', 'req'] as const) {
    const original = relayPool[method].bind(relayPool) as (
      ...args: unknown[]
    ) => Observable<unknown>
    relayPool[method] = ((relays: unknown, filters: unknown, opts: unknown) => {
      // ponytail: observable/function filter inputs are not scoped (no caller uses them);
      // they still hit the relay allowlist and the store gate below.
      if (!Array.isArray(relays) || typeof filters === 'function' || isObservable(filters)) {
        return original(relays, filters, opts)
      }
      const scoped = scopeVideoRequest(
        instance,
        relays as string[],
        (Array.isArray(filters) ? filters : [filters]) as Filter[]
      )
      return scoped ? original(scoped.relays, scoped.filters, opts) : EMPTY
    }) as never
  }

  // 3. video events of non-creators never enter the store (cache, by-id lookups, any path).
  const verify = eventStore.verifyEvent
  eventStore.verifyEvent = event =>
    (!isVideoKind(event.kind) || instance.creators.includes(event.pubkey)) &&
    (verify?.(event) ?? true)
}

// Configure unified event loader for all pointer types
// Handles both EventPointer (by id) and AddressPointer (by kind/pubkey/d-tag)
// This includes kind 10063 (blossom servers), kind 10002 (relay lists), profiles, etc.
// Instance build: no relay hints; by-id and address lookups use the instance relays.
createEventLoaderForStore(eventStore, relayPool, {
  cacheRequest,
  lookupRelays: instance ? instanceRelays(instance) : DEFAULT_RELAYS,
  extraRelays: instance ? instanceRelays(instance) : undefined,
  bufferTime: 0, // Don't batch - emit first result immediately
  followRelayHints: !instance,
})

console.log('📡 Configured unified EventStore loader with relays:', DEFAULT_RELAYS)

// Save new events to the cache. Kind 5 tombstones are cached explicitly in loaders.
presistEventsToCache(eventStore, cacheEvents)

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
// Each call to the returned function loads the next page and COMPLETES once
// every source answered (EOSE, idle timeout, or error). Each relay (and the
// local cache) pages backward from its own cursor: with a shared cursor a
// dense relay's middle window gets skipped once a sparse relay reaches far
// back. Sources that return nothing, ignore `until`, or error are done.
type FilterKey = string

/** Loads the next page on each call; the observable completes when the page is done. */
export type PageLoader = () => Observable<NostrEvent>

export function getTimelineLoader(
  _key: FilterKey,
  baseFilters: Filter,
  relays: string[] = DEFAULT_RELAYS,
  options?: { skipCache?: boolean }
): PageLoader {
  const limit = baseFilters.limit ?? 100
  const pageFilters = (until?: number) => {
    const page: Filter =
      until === undefined ? { ...baseFilters, limit } : { ...baseFilters, limit, until }
    return [page, ...buildDeletionFilters([page])]
  }

  const requests: Array<(until?: number) => Observable<NostrEvent>> = relays.map(
    relay => until => relayPool.request([relay], pageFilters(until))
  )
  if (!options?.skipCache) {
    requests.push(until => from(cacheRequest(pageFilters(until))).pipe(mergeMap(events => events)))
  }
  const cursors = requests.map(() => ({
    until: undefined as number | undefined,
    done: false,
    loading: false,
  }))

  const loadPage = (index: number) => {
    const cursor = cursors[index]
    if (cursor.done || cursor.loading) return EMPTY
    cursor.loading = true
    const until = cursor.until
    let oldest = Infinity
    let answered = false
    return requests[index](until).pipe(
      tap({
        next: event => {
          // Deletions ride along in the same window; they must not drive the cursor.
          if (!baseFilters.kinds || baseFilters.kinds.includes(event.kind)) {
            oldest = Math.min(oldest, event.created_at)
          }
        },
        complete: () => {
          answered = true
        },
      }),
      catchError(() => {
        cursor.done = true
        return EMPTY
      }),
      finalize(() => {
        cursor.loading = false
        if (oldest !== Infinity) {
          // NIP-01 `until` is inclusive; stop if the relay ignores it.
          if (until !== undefined && oldest > until) cursor.done = true
          else cursor.until = oldest - 1
        } else if (answered) {
          cursor.done = true
        }
        // Unsubscribed before any event: keep the cursor and retry next page.
      })
    )
  }

  return () =>
    defer(() => merge(...requests.map((_, index) => loadPage(index)))).pipe(
      tap(event => {
        if (event.kind === 5) void cacheEvents([event])
      }),
      filterDuplicateEvents(eventStore)
    )
}

import { getOutboxes, groupPubkeysByRelay, mergeRelaySets } from 'applesauce-core/helpers'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import type { NostrEvent } from 'nostr-tools'
import {
  concat,
  defer,
  EMPTY,
  from,
  ignoreElements,
  merge,
  mergeMap,
  Observable,
  shareReplay,
  tap,
} from 'rxjs'
import type { NostubeClient, PageLoader } from './client'
import { getKindsForType } from './video-types'

const RELAY_LIST_TTL_MS = 5 * 60 * 1000
type RelayListResolver = (pubkey: string, relays: string[]) => Observable<NostrEvent>
const resolvers = new WeakMap<NostubeClient, RelayListResolver>()

function createRelayListResolver(client: NostubeClient) {
  // One batching engine per client; concurrent Home/Subscriptions consumers share lookups.
  const loader = createAddressLoader(client.relayPool, {
    bufferTime: 20,
    bufferSize: 200,
    eventStore: null,
  })
  const pending = new Map<string, { expires: number; result: Observable<NostrEvent> }>()
  let prunedAt = 0
  return (pubkey: string, relays: string[]) => {
    if (Date.now() - prunedAt >= RELAY_LIST_TTL_MS) {
      for (const [key, entry] of pending) {
        if (entry.expires <= Date.now()) pending.delete(key)
      }
      prunedAt = Date.now()
    }
    const key = JSON.stringify([pubkey, relays])
    const cached = pending.get(key)
    if (cached && cached.expires > Date.now()) return cached.result
    // Cache misses are retained too, avoiding repeated lookups for creators without NIP-65.
    const entry = {
      expires: Infinity,
      result: loader({ kind: 10002, pubkey, relays, cache: false }).pipe(
        tap({
          complete: () => {
            entry.expires = Date.now() + RELAY_LIST_TTL_MS
          },
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      ),
    }
    pending.set(key, entry)
    return entry.result
  }
}

/**
 * Cache/read-relay results start immediately. NIP-65 lookups are batched and shared;
 * cached outboxes start before the refresh finishes. Each new relay/author pair is
 * added only once, without resetting already-paged sources.
 */
export function createSubscriptionsLoader(
  client: NostubeClient,
  authors: string[],
  readRelays: string[],
  discoveryRelays: string[],
  relayHints: Record<string, string[]> = {}
): PageLoader {
  const pubkeys = [...new Set(authors)].filter(pubkey => /^[a-f0-9]{64}$/.test(pubkey)).sort()
  if (pubkeys.length === 0) return Object.assign(() => EMPTY, { exhausted: () => true })
  const relays = mergeRelaySets(readRelays)
  const lookups = mergeRelaySets(discoveryRelays).sort()
  const filter = { kinds: getKindsForType('all'), authors: pubkeys }
  const sources: PageLoader[] = [client.getTimelineLoader('subscriptions', filter, relays)]
  const queried = new Map(relays.map(relay => [relay, new Set(pubkeys)]))
  let resolved = false

  if (!resolvers.has(client)) resolvers.set(client, createRelayListResolver(client))
  const resolve: RelayListResolver = resolvers.get(client)!

  const addOutboxes = () => {
    const pointers = pubkeys.map(pubkey => {
      const event = client.eventStore.getReplaceable(10002, pubkey)
      return { pubkey, relays: mergeRelaySets(event ? getOutboxes(event) : [], relayHints[pubkey]) }
    })
    const relayAuthors: Record<string, string[]> = {}
    for (const [relay, users] of Object.entries(groupPubkeysByRelay(pointers))) {
      const seen = queried.get(relay) ?? new Set<string>()
      const missing = users.map(user => user.pubkey).filter(pubkey => !seen.has(pubkey))
      if (missing.length === 0) continue
      missing.forEach(pubkey => seen.add(pubkey))
      queried.set(relay, seen)
      relayAuthors[relay] = missing
    }
    if (Object.keys(relayAuthors).length === 0) return EMPTY
    const source = client.getTimelineLoader(
      'subscriptions:outboxes',
      filter,
      Object.keys(relayAuthors),
      {
        skipCache: true,
        relayAuthors,
      }
    )
    sources.push(source)
    return source()
  }

  const discovery = merge(
    defer(() => from(client.cacheRequest([{ kinds: [10002], authors: pubkeys }]))).pipe(
      tap(events => events.forEach(event => client.eventStore.add(event))),
      mergeMap(() => addOutboxes())
    ),
    concat(
      defer(() => from(pubkeys).pipe(mergeMap(pubkey => resolve(pubkey, lookups)))).pipe(
        tap<NostrEvent>(event => client.eventStore.add(event)),
        ignoreElements()
      ),
      defer(addOutboxes)
    )
  ).pipe(
    tap({
      complete: () => {
        resolved = true
      },
    }),
    // A UI settle timeout must not abandon discovery or strand its new sources.
    shareReplay({ bufferSize: 1, refCount: false })
  )

  const loader: PageLoader = () =>
    defer(() => {
      const pages = sources.map(source => source())
      if (!resolved) pages.push(discovery)
      return merge(...pages)
    })
  loader.exhausted = () => resolved && sources.every(source => source.exhausted?.())
  return loader
}

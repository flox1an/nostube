import type { IEventStore } from 'applesauce-core'
import type { RelayPool } from 'applesauce-relay'
import type { GroupReqMessage } from 'applesauce-relay/types'
import type { Filter } from 'nostr-tools'
import { map, tap } from 'rxjs'

const FRESH_MS = 30_000
interface Entry {
  filter: Filter
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
  expires: number
}
interface RelayState {
  entries: Map<string, Entry>
  queued: Entry[]
}
const clients = new WeakMap<RelayPool, WeakMap<IEventStore, Map<string, RelayState>>>()

/** Store-backed interaction reads; concurrent consumers share one REQ per relay and microtask. */
export async function loadInteractions(
  pool: RelayPool,
  store: IEventStore,
  relays: string[],
  {
    eventIds = [],
    address,
    comments = true,
  }: {
    eventIds?: string[]
    address?: string
    comments?: boolean
  }
): Promise<void> {
  let stores = clients.get(pool)
  if (!stores) clients.set(pool, (stores = new WeakMap()))
  let states = stores.get(store)
  if (!states) stores.set(store, (states = new Map()))
  const filters: Filter[] = []
  for (const id of new Set(eventIds)) {
    filters.push({ kinds: [7], '#e': [id] })
    if (comments)
      filters.push(
        { kinds: [1], '#e': [id], limit: 100 },
        { kinds: [1111], '#E': [id], limit: 100 }
      )
  }
  if (address) {
    filters.push({ kinds: [7], '#a': [address] })
    if (comments)
      filters.push(
        { kinds: [1], '#a': [address], limit: 100 },
        { kinds: [1111], '#A': [address], limit: 100 }
      )
  }
  const pending: Promise<void>[] = []
  for (const relay of new Set(relays.map(url => new URL(url).href))) {
    let state = states.get(relay)
    if (!state) states.set(relay, (state = { entries: new Map(), queued: [] }))
    const current = state
    // Drop expired entries rather than growing a session-long history of viewed videos.
    for (const [key, entry] of current.entries) {
      if (entry.expires <= Date.now()) current.entries.delete(key)
    }
    for (const filter of filters) {
      const key = JSON.stringify(filter)
      let entry = current.entries.get(key)
      if (!entry) {
        const deferred = Promise.withResolvers<void>()
        entry = { filter, ...deferred, expires: Infinity }
        current.entries.set(key, entry)
        current.queued.push(entry)
        if (current.queued.length === 1)
          queueMicrotask(() => {
            const batch = current.queued.splice(0)
            const fail = (error: unknown) => {
              for (const item of batch) {
                if (current.entries.get(JSON.stringify(item.filter)) === item) {
                  current.entries.delete(JSON.stringify(item.filter))
                }
                item.reject(error)
              }
            }
            try {
              // Finish this bounded read even if its slide unmounts: another consumer may need it.
              pool
                .request(
                  [relay],
                  batch.map(item => item.filter),
                  {
                    complete: messages =>
                      messages.pipe(
                        map((message: GroupReqMessage) => {
                          if (message.type === 'ERROR') throw message.error
                          if (message.type === 'CLOSED') throw new Error(message.reason)
                          return message.type === 'EOSE'
                        })
                      ),
                  }
                )
                .pipe(tap(event => store.add(event)))
                .subscribe({
                  error: fail,
                  complete: () => {
                    for (const item of batch) {
                      item.expires = Date.now() + FRESH_MS
                      item.resolve()
                    }
                  },
                })
            } catch (error) {
              fail(error)
            }
          })
      }
      pending.push(entry.promise)
    }
  }
  await Promise.all(pending)
}

import type { Filter, NostrEvent } from 'nostr-tools'
import type { Observable } from 'rxjs'
import type { RelayPool } from 'applesauce-relay'
import { mapEventsToStore } from 'applesauce-core/observable'

/**
 * Loads the newest events matching `filters` from `relays` once and completes when the relays
 * are done (EOSE and idle). With `eventStore`, events are added to it and the stored instance is
 * emitted once per event. `limit` caps each filter that does not set its own.
 *
 * Replaces the one-shot `createTimelineLoader(...)()` of applesauce 6; the v7 loader pages
 * through explicit time windows instead.
 */
export function loadFromRelays(
  pool: Pick<RelayPool, 'request'>,
  relays: string[],
  filters: Filter | Filter[],
  options?: { eventStore?: Parameters<typeof mapEventsToStore>[0]; limit?: number }
): Observable<NostrEvent> {
  const limit = options?.limit
  const list = (Array.isArray(filters) ? filters : [filters]).map(filter =>
    limit !== undefined && filter.limit === undefined ? { ...filter, limit } : filter
  )
  const events$ = pool.request(relays, list)
  return options?.eventStore ? events$.pipe(mapEventsToStore(options.eventStore)) : events$
}

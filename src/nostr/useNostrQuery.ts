import { use$, useEventStore } from 'applesauce-react/hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { of } from 'rxjs'
import { type Filter, type NostrEvent } from 'nostr-tools'
import { getTimelineLoader } from './core'
import { useReadRelays } from '@/hooks/useReadRelays'
import { hashObjectBigInt } from '@/lib/utils'

export interface UseNostrQueryOptions {
  /** Relays to load from. Defaults to app read relays. Pass [] for store-only (no relay fetch). */
  relays?: string[]
  /** Skip loading entirely. Useful for conditional queries. Default: true */
  enabled?: boolean
}

/**
 * Subscribes to events matching `filters` from the EventStore and loads from relays.
 *
 * Handles subscription lifecycle, relay fetching, deduplication, and Observable → React
 * state bridging internally. Raw `useEventStore()` remains available for advanced cases.
 *
 * @example
 * const filters = useMemo(() => ({ kinds: [9734], authors: [pubkey] }), [pubkey])
 * const { events, isLoading } = useNostrQuery(filters)
 */
export function useNostrQuery(
  filters: Filter | Filter[] | null,
  options: UseNostrQueryOptions = {}
): { events: NostrEvent[]; isLoading: boolean } {
  const eventStore = useEventStore()
  const appRelays = useReadRelays()
  const { relays = appRelays, enabled = true } = options
  const [isLoading, setIsLoading] = useState(true)

  const normalizedFilters = useMemo<Filter[] | null>(() => {
    if (!filters) return null
    return Array.isArray(filters) ? filters : [filters]
  }, [filters])

  const rawEvents = use$(() => {
    if (!normalizedFilters || !enabled) return of([])
    return eventStore.timeline(normalizedFilters)
  }, [eventStore, normalizedFilters, enabled])

  const events = useMemo(() => rawEvents ?? [], [rawEvents])

  // Stable string key for relays so the effect doesn't re-run on array identity changes
  const relaysKey = useMemo(() => relays.slice().sort().join(','), [relays])
  const relaysRef = useRef(relays)
  useEffect(() => {
    relaysRef.current = relays
  })

  useEffect(() => {
    if (!normalizedFilters || !enabled || relaysRef.current.length === 0) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    let remaining = normalizedFilters.length
    const onDone = () => {
      remaining--
      if (remaining === 0) setIsLoading(false)
    }

    const subs = normalizedFilters.map(filter => {
      const key = String(hashObjectBigInt({ filter, relays: relaysKey }))
      const loader = getTimelineLoader(key, filter, relaysRef.current)
      return loader().subscribe({
        next: event => eventStore.add(event),
        complete: onDone,
        error: onDone,
      })
    })

    return () => subs.forEach(s => s.unsubscribe())
  }, [normalizedFilters, enabled, relaysKey, eventStore])

  return { events, isLoading }
}

/**
 * Subscribes to a single Nostr event by ID. Automatically fetches from relays via the
 * global event loader configured in `core.ts` if the event is not already in the store.
 *
 * @example
 * const { event, isLoading } = useNostrEvent(eventId)
 */
export function useNostrEvent(id: string | null): {
  event: NostrEvent | null
  isLoading: boolean
} {
  const eventStore = useEventStore()
  const [timedOut, setTimedOut] = useState(false)

  const event = use$(() => (id ? eventStore.event(id) : of(undefined)), [eventStore, id])

  useEffect(() => {
    if (!id) return
    setTimedOut(false)
    const timeout = setTimeout(() => setTimedOut(true), 10_000)
    return () => clearTimeout(timeout)
  }, [id])

  const isLoading = !!id && event === undefined && !timedOut

  return { event: event ?? null, isLoading }
}

/**
 * Convenience: subscribe to a single event via filters (e.g. a replaceable event).
 * Returns the first matching event from the store.
 */
export function useNostrQueryFirst(
  filters: Filter | Filter[] | null,
  options?: UseNostrQueryOptions
): { event: NostrEvent | null; isLoading: boolean } {
  const { events, isLoading } = useNostrQuery(filters, options)
  const event = useMemo(() => events[0] ?? null, [events])
  return { event, isLoading }
}

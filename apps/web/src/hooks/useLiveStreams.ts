import { use$, useEventStore } from 'applesauce-react/hooks'
import { useEffect, useMemo, useState } from 'react'
import type { Filter } from 'nostr-tools'
import { parseLiveStream, safeLiveRelay, type LiveStream } from '@nostube/core/live-stream'
import { useAppContext } from './useAppContext'
import { useReadRelays } from './useReadRelays'

/** Relays that carry NIP-53 activity; always queried alongside the configured read relays. */
export const LIVE_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.zap.stream',
]

const LOAD_TIMEOUT_MS = 8000
const DISCOVERY_WINDOW_SECONDS = 24 * 60 * 60
const DISCOVERY_LIMIT = 150
const HEX_PUBKEY = /^[0-9a-f]{64}$/

/**
 * Keeps one REQ open on `hints` (sanitized) + read relays + LIVE_RELAYS, feeding the EventStore.
 * Loading ends at the first EOSE or after LOAD_TIMEOUT_MS. Re-subscribes when filters/relays change.
 */
export function useLiveRelayFeed(filters: Filter[] | null, hints: string[] = []) {
  const { pool } = useAppContext()
  const eventStore = useEventStore()
  const readRelays = useReadRelays()
  const relaysKey = [
    ...new Set(
      [...hints.filter(safeLiveRelay), ...readRelays, ...LIVE_RELAYS].map(url =>
        url.replace(/\/$/, '')
      )
    ),
  ].join(',')
  const relays = useMemo(() => relaysKey.split(','), [relaysKey])
  const filtersKey = filters && JSON.stringify(filters)
  const [state, setState] = useState<{ isLoading: boolean; error: string | null }>({
    isLoading: !!filters,
    error: null,
  })

  useEffect(() => {
    if (!filtersKey) {
      setState({ isLoading: false, error: null })
      return
    }
    setState({ isLoading: true, error: null })
    const loaded = () => setState(s => (s.isLoading ? { ...s, isLoading: false } : s))
    const timer = setTimeout(loaded, LOAD_TIMEOUT_MS)
    const failed = new Set<string>()
    const sub = pool.req(relays, JSON.parse(filtersKey) as Filter[]).subscribe({
      next: msg => {
        if (msg.type === 'EVENT') eventStore.add(msg.event)
        else if (msg.type === 'EOSE') loaded()
        else if (msg.type === 'ERROR' || msg.type === 'CLOSED') {
          failed.add(msg.from)
          if (failed.size >= relays.length)
            setState({ isLoading: false, error: 'Could not reach live relays' })
        }
      },
      error: err =>
        setState({ isLoading: false, error: err instanceof Error ? err.message : String(err) }),
    })
    return () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [filtersKey, relays, pool, eventStore])

  return { ...state, relays }
}

/**
 * NIP-53 live activities. Without `pointer`: recent discovery (24h, all statuses, page filters).
 * With `pointer`: the exact address (all statuses); invalid pointers subscribe to nothing.
 * The EventStore keeps only the newest event per address, so an ended update replaces a live one.
 */
export function useLiveStreams(pointer?: {
  pubkey: string
  identifier: string
  relays?: string[]
}) {
  const eventStore = useEventStore()
  const pubkey = pointer?.pubkey.toLowerCase()
  const identifier = pointer?.identifier
  const isDetail = !!pointer
  const since = useMemo(() => Math.floor(Date.now() / 1000) - DISCOVERY_WINDOW_SECONDS, [])

  const filters = useMemo<Filter[] | null>(() => {
    if (!isDetail) return [{ kinds: [30311], since, limit: DISCOVERY_LIMIT }]
    if (!pubkey || !HEX_PUBKEY.test(pubkey) || !identifier) return null
    return [{ kinds: [30311], authors: [pubkey], '#d': [identifier] }]
  }, [isDetail, pubkey, identifier, since])

  const { isLoading, error, relays } = useLiveRelayFeed(filters, pointer?.relays)
  const events = use$(
    () => (filters ? eventStore.timeline(filters) : undefined),
    [eventStore, filters]
  )

  // ponytail: stale-live (>1h) is re-evaluated only when events change; add a clock tick if pages idle long
  const streams = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    return (filters ? (events ?? []) : [])
      .map(event => parseLiveStream(event, now))
      .filter((stream): stream is LiveStream => stream !== null)
      .slice(0, DISCOVERY_LIMIT)
  }, [events, filters])

  return { streams, isLoading, error, relays }
}

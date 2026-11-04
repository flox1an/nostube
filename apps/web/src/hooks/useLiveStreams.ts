import { use$, useEventStore } from 'applesauce-react/hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { kinds, type Filter, type NostrEvent } from 'nostr-tools'
import { isHexKey } from 'applesauce-core/helpers/string'
import {
  getLiveStreamPlayback,
  parseLiveStream,
  safeLiveRelay,
  type LiveStream,
} from '@nostube/core/live-stream'
import { getInstanceConfig } from '@nostube/core/instance-config'
import { LIVE_RELAYS } from '@/constants/relays'
import { useAppContext } from './useAppContext'
import { useReadRelays } from './useReadRelays'
import { useBlockedPubkeys, useReportedPubkeys } from './useReportedPubkeys'
import { useSelectedPreset } from './useSelectedPreset'

const LOAD_TIMEOUT_MS = 8000
const DISCOVERY_WINDOW_SECONDS = 24 * 60 * 60
const DISCOVERY_LIMIT = 150

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

/** Subscribes to `filters` and returns the parsed kind 30311 streams in the store. */
function useStreamQuery(filters: Filter[] | null, hints?: string[]) {
  const eventStore = useEventStore()
  const { isLoading, error, relays } = useLiveRelayFeed(filters, hints)
  const events = use$(
    () => (filters ? eventStore.timeline(filters) : undefined),
    [eventStore, filters]
  )
  // ponytail: stale-live (>1h) is re-evaluated only when events change; add a clock tick if pages idle long
  const streams = useMemo(() => parseStreams(filters ? events : undefined), [events, filters])
  return { streams, isLoading, error, relays }
}

function parseStreams(events: NostrEvent[] | undefined): LiveStream[] {
  const now = Math.floor(Date.now() / 1000)
  return (events ?? [])
    .map(event => parseLiveStream(event, now))
    .filter((stream): stream is LiveStream => stream !== null)
}

const watchable = (stream: LiveStream) =>
  stream.status === 'live' && stream.streamingUrls.length > 0

/**
 * Moderation for live streams: whether one may play and with which content warning.
 * Lists (`feed`) also leave out muted accounts; a stream page only blocked ones.
 */
export function useLiveStreamPlayback(feed: boolean) {
  const { config } = useAppContext()
  const blocked = useBlockedPubkeys()
  const reported = useReportedPubkeys()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = feed ? reported : blocked
  return useCallback(
    (stream: LiveStream) =>
      getLiveStreamPlayback(stream, {
        nsfwFilter: config.nsfwFilter,
        nsfwPubkeys: presetContent.nsfwPubkeys,
        blockedPubkeys,
        blockedEvents: presetContent.blockedEvents,
      }),
    [config.nsfwFilter, presetContent, blockedPubkeys]
  )
}

/** Discovery: streams live right now, from the last 24h of announcements, moderated. */
export function useLiveStreams() {
  const since = useMemo(() => Math.floor(Date.now() / 1000) - DISCOVERY_WINDOW_SECONDS, [])
  const filters = useMemo<Filter[]>(
    () => [{ kinds: [kinds.LiveEvent], since, limit: DISCOVERY_LIMIT }],
    [since]
  )
  const { streams, isLoading, error } = useStreamQuery(filters)
  const playback = useLiveStreamPlayback(true)
  const visible = useMemo(
    () =>
      streams
        .filter(watchable)
        .map(stream => ({ stream, ...playback(stream) }))
        .filter(item => item.playback !== 'hidden'),
    [streams, playback]
  )
  return { streams: visible, isLoading, error }
}

/**
 * One stream by its address, any status. The EventStore keeps only the newest event per
 * address, so an ended update replaces a live one. No pointer subscribes to nothing.
 */
export function useLiveStream(
  pointer: { pubkey: string; identifier: string; relays?: string[] } | undefined
) {
  const pubkey = pointer?.pubkey.toLowerCase()
  const identifier = pointer?.identifier
  const filters = useMemo<Filter[] | null>(
    () =>
      pubkey && isHexKey(pubkey) && identifier
        ? [{ kinds: [kinds.LiveEvent], authors: [pubkey], '#d': [identifier] }]
        : null,
    [pubkey, identifier]
  )
  const { streams, isLoading, error } = useStreamQuery(filters, pointer?.relays)
  return { stream: streams[0], isLoading, error }
}

/**
 * Watchable, moderated streams an author publishes or hosts (zap.stream publishes as
 * provider, host in `p`), newest start first. Empty in server-instance builds.
 */
export function useAuthorLiveStreams(pubkey: string | undefined, hints: string[] = []) {
  const since = useMemo(() => Math.floor(Date.now() / 1000) - DISCOVERY_WINDOW_SECONDS, [])
  const filters = useMemo<Filter[] | null>(
    () =>
      pubkey && isHexKey(pubkey) && !getInstanceConfig()
        ? [
            { kinds: [kinds.LiveEvent], authors: [pubkey], since },
            { kinds: [kinds.LiveEvent], '#p': [pubkey], since },
          ]
        : null,
    [pubkey, since]
  )
  const { streams } = useStreamQuery(filters, hints)
  const playback = useLiveStreamPlayback(true)
  return useMemo(
    () =>
      streams
        .filter(
          stream =>
            watchable(stream) && (stream.hostPubkey === pubkey || stream.authorPubkey === pubkey)
        )
        .map(stream => ({ stream, ...playback(stream) }))
        .filter(item => item.playback !== 'hidden')
        .sort(
          (a, b) =>
            (b.stream.starts ?? b.stream.event.created_at) -
            (a.stream.starts ?? a.stream.event.created_at)
        ),
    [streams, pubkey, playback]
  )
}

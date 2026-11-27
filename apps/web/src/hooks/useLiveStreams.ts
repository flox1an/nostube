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
// ponytail: relays cap REQs at 500, ~330 kB per relay; a live announcement that stopped updating
// sinks behind fresh ones of other streams, so 150 missed busy days. Paginate if 500 runs short.
const DISCOVERY_LIMIT = 500

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
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(a => a + 1), [])
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
  }, [filtersKey, relays, pool, eventStore, attempt])

  return { ...state, relays, retry }
}

/** Subscribes to `filters` and returns the parsed kind 30311 streams in the store. */
function useStreamQuery(filters: Filter[] | null, hints?: string[]) {
  const eventStore = useEventStore()
  const { isLoading, error, relays, retry } = useLiveRelayFeed(filters, hints)
  const events = use$(
    () => (filters ? eventStore.timeline(filters) : undefined),
    [eventStore, filters]
  )
  // ponytail: the 2h/12h age rule is re-evaluated only when events change; add a clock tick if pages idle long
  const parsed = useMemo(() => parseStreams(filters ? events : undefined), [events, filters])
  const probes = useStaleProbes(parsed)
  const streams = useMemo(
    () =>
      parsed.map(stream =>
        stream.stale && probes[stream.streamingUrls[0]] !== true
          ? { ...stream, status: 'ended' as const }
          : stream
      ),
    [parsed, probes]
  )
  return { streams, isLoading, error, relays, retry }
}

function parseStreams(events: NostrEvent[] | undefined): LiveStream[] {
  const now = Math.floor(Date.now() / 1000)
  return (events ?? [])
    .map(event => parseLiveStream(event, now))
    .filter((stream): stream is LiveStream => stream !== null)
}

const PROBE_TTL_MS = 5 * 60_000
const PROBE_TIMEOUT_MS = 5000
const probeCache = new Map<string, { at: number; result: Promise<boolean> }>()

/**
 * Whether a stream URL still answers: an HLS playlist that loads, or an MP4 that responds. One
 * request per URL every 5 minutes, shared by every hook. CORS failures count as down.
 */
function probeStream(url: string): Promise<boolean> {
  const cached = probeCache.get(url)
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.result
  const result = fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: 'no-store' })
    .then(async res => {
      if (!res.ok) return false
      if (!/\.m3u8$/i.test(new URL(url).pathname)) return true
      return (await res.text()).trimStart().startsWith('#EXTM3U')
    })
    .catch(() => false)
  probeCache.set(url, { at: Date.now(), result })
  return result
}

/** Probe results for the first stream URL of every stale live stream; missing until answered. */
function useStaleProbes(streams: LiveStream[]): Record<string, boolean> {
  const [results, setResults] = useState<Record<string, boolean>>({})
  const urls = streams.filter(s => s.stale && s.streamingUrls[0]).map(s => s.streamingUrls[0])
  const key = [...new Set(urls)].sort().join('\n')
  useEffect(() => {
    if (!key) return
    let active = true
    for (const url of key.split('\n'))
      void probeStream(url).then(up => {
        if (active) setResults(prev => (prev[url] === up ? prev : { ...prev, [url]: up }))
      })
    return () => {
      active = false
    }
  }, [key])
  return results
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

/**
 * Discovery: streams with `status` from the last 24h of announcements, moderated. Live ones need
 * a stream URL; a live announcement older than 2h only stays live while its stream answers
 * (see useStreamQuery), one older than 12h is ended (see parseLiveStream).
 */
export function useLiveStreams(status: LiveStream['status'] = 'live') {
  const [since] = useState(() => Math.floor(Date.now() / 1000) - DISCOVERY_WINDOW_SECONDS)
  const filters = useMemo<Filter[]>(
    () => [{ kinds: [kinds.LiveEvent], since, limit: DISCOVERY_LIMIT }],
    [since]
  )
  const { streams, isLoading, error, retry } = useStreamQuery(filters)
  const playback = useLiveStreamPlayback(true)
  const visible = useMemo(
    () =>
      streams
        .filter(stream => (status === 'live' ? watchable(stream) : stream.status === status))
        .map(stream => ({ stream, ...playback(stream) }))
        .filter(item => item.playback !== 'hidden')
        // Streamers re-announce every minute (new created_at), so order by the fixed start time,
        // address as tiebreak. Planned: next start first, unknown start last.
        .sort(
          (a, b) =>
            (status === 'planned'
              ? (a.stream.starts ?? Infinity) - (b.stream.starts ?? Infinity)
              : (b.stream.starts ?? 0) - (a.stream.starts ?? 0)) ||
            a.stream.address.localeCompare(b.stream.address)
        ),
    [streams, playback, status]
  )
  return { streams: visible, isLoading, error, retry }
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
  const [since] = useState(() => Math.floor(Date.now() / 1000) - DISCOVERY_WINDOW_SECONDS)
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

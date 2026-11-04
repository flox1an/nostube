import { nip19, type NostrEvent } from 'nostr-tools'
import type { NsfwFilter } from './app-config'
import { getVideoPlayback, type VideoPlayback } from './content-safety'

/** NIP-53 live activity (kind 30311), sanitized for read-only viewing. */
export interface LiveStream {
  event: NostrEvent
  address: string
  naddr: string
  identifier: string
  authorPubkey: string
  /** `Host` p-tag key (unverified: proofs are not checked), else the author. Display only. */
  hostPubkey: string
  title: string
  summary: string
  image?: string
  streamingUrls: string[]
  recordingUrl?: string
  status: 'live' | 'planned' | 'ended'
  starts?: number
  participants?: number
  relays: string[]
  contentWarning?: string
}

const LIVE_KIND = 30311
const STALE_LIVE_SECONDS = 60 * 60
const MAX_FUTURE_SKEW_SECONDS = 60
const HEX_PUBKEY = /^[0-9a-f]{64}$/
const MAX_RELAYS = 10

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  // ponytail: rejects every IPv6 literal instead of classifying ranges; public IPv6 relays are rare
  if (host.startsWith('[')) return true
  const ip = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
  if (!ip) return false
  const [a, b] = [Number(ip[1]), Number(ip[2])]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function publicUrl(value: string | undefined, protocol: 'https:' | 'wss:'): URL | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== protocol || url.username || url.password) return null
    return isPrivateHost(url.hostname) ? null : url
  } catch {
    return null
  }
}

/** Public `wss://` relay without credentials or local/private host. */
export function safeLiveRelay(url: string): boolean {
  return publicUrl(url, 'wss:') !== null
}

function playbackUrl(value: string | undefined): string | undefined {
  const url = publicUrl(value, 'https:')
  return url && /\.(m3u8|mp4)$/i.test(url.pathname) ? url.href : undefined
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : undefined
}

/**
 * Parse a kind 30311 event. Returns null for malformed or future-dated events.
 * Callers must pass the newest event per address (the EventStore keeps only that one).
 */
export function parseLiveStream(
  event: NostrEvent,
  nowSeconds = Math.floor(Date.now() / 1000)
): LiveStream | null {
  if (event.kind !== LIVE_KIND || !HEX_PUBKEY.test(event.pubkey)) return null
  if (!Number.isFinite(event.created_at) || event.created_at > nowSeconds + MAX_FUTURE_SKEW_SECONDS)
    return null

  const tag = (name: string) => event.tags.find(t => t[0] === name)?.[1]
  const identifier = tag('d')
  // naddr TLV lengths are one byte
  if (!identifier || new TextEncoder().encode(identifier).length > 255) return null

  const rawStatus = tag('status')?.trim().toLowerCase()
  let status: LiveStream['status'] =
    rawStatus === 'live' || rawStatus === 'planned' ? rawStatus : 'ended'
  if (status === 'live' && nowSeconds - event.created_at > STALE_LIVE_SECONDS) status = 'ended'

  const host = event.tags.find(
    t => t[0] === 'p' && t[3]?.trim().toLowerCase() === 'host' && HEX_PUBKEY.test(t[1] ?? '')
  )?.[1]

  const relays = [
    ...new Set(
      event.tags
        .filter(t => t[0] === 'relays')
        .flatMap(t => t.slice(1))
        .map(r => publicUrl(r, 'wss:')?.href)
        .filter((r): r is string => !!r && r.length <= 255)
    ),
  ].slice(0, MAX_RELAYS)

  const streamingUrls = [
    ...new Set(
      event.tags
        .filter(t => t[0] === 'streaming')
        .map(t => playbackUrl(t[1]))
        .filter((u): u is string => !!u)
    ),
  ]

  const warning = event.tags.find(t => t[0] === 'content-warning')
  const address = `${LIVE_KIND}:${event.pubkey}:${identifier}`

  return {
    event,
    address,
    naddr: nip19.naddrEncode({
      kind: LIVE_KIND,
      pubkey: event.pubkey,
      identifier,
      relays: relays.slice(0, 3),
    }),
    identifier,
    authorPubkey: event.pubkey,
    hostPubkey: host ?? event.pubkey,
    title: tag('title')?.trim() ?? '',
    summary: tag('summary')?.trim() ?? '',
    image: publicUrl(tag('image'), 'https:')?.href,
    streamingUrls,
    recordingUrl: playbackUrl(tag('recording')),
    status,
    starts: positiveInt(tag('starts')),
    participants: positiveInt(tag('current_participants')),
    relays,
    contentWarning: warning ? warning[1]?.trim() || 'NSFW' : undefined,
  }
}

export interface LiveStreamModeration {
  nsfwFilter: NsfwFilter | undefined
  nsfwPubkeys: string[]
  blockedPubkeys?: Record<string, unknown>
  blockedEvents: string[]
}

/**
 * Whether a stream may play, and the content warning to show with it: its own
 * `content-warning`, else `NSFW` for a preset NSFW host or publisher. Blocked host,
 * publisher or announcement hides it.
 */
export function getLiveStreamPlayback(
  stream: LiveStream,
  { nsfwFilter, nsfwPubkeys, blockedPubkeys, blockedEvents }: LiveStreamModeration
): { playback: VideoPlayback; warning?: string } {
  const keys = [stream.hostPubkey, stream.authorPubkey]
  if (keys.some(key => blockedPubkeys?.[key]) || blockedEvents.includes(stream.event.id))
    return { playback: 'hidden' }
  const warning =
    stream.contentWarning || (keys.some(key => nsfwPubkeys.includes(key)) ? 'NSFW' : undefined)
  return { playback: getVideoPlayback(warning, nsfwFilter), warning }
}

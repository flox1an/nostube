import { SimplePool } from 'nostr-tools/pool'
import { decode } from 'nostr-tools/nip19'
import type { NostrEvent } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

export const FALLBACK_RELAYS = [
  'wss://relay.nostu.be',
  'wss://relay.divine.video',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

export const FETCH_TIMEOUT_MS = 4000

export type PageType = 'video' | 'short' | 'playlist'

/** Extract page type and nip19 identifier from a nostube URL path */
export function parsePageUrl(pathname: string): { type: PageType; identifier: string } | null {
  const parts = pathname.split('/')
  if (parts[1] === 'v' && parts[2]) return { type: 'video', identifier: parts[2] }
  if (parts[1] === 'short' && parts[2]) return { type: 'short', identifier: parts[2] }
  if (parts[1] === 'playlist' && parts[2]) return { type: 'playlist', identifier: parts[2] }
  return null
}

/** Build the canonical user-facing page URL (avoids Vercel rewrite query params) */
export function buildPageUrl(baseUrl: string, type: PageType, identifier: string): string {
  const typePath = type === 'short' ? 'short' : type === 'playlist' ? 'playlist' : 'v'
  return `${baseUrl}/${typePath}/${identifier}`
}

export function log(msg: string, data?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), msg, ...data }
  console.log(JSON.stringify(entry))
}

export interface DecodedIdentifier {
  type: 'nevent' | 'naddr' | 'note'
  id?: string
  kind?: number
  pubkey?: string
  identifier?: string
  relays: string[]
}

export function decodeIdentifier(nip19str: string): DecodedIdentifier | null {
  try {
    const decoded = decode(nip19str)
    switch (decoded.type) {
      case 'nevent':
        return {
          type: 'nevent',
          id: decoded.data.id,
          kind: decoded.data.kind,
          pubkey: decoded.data.author ?? undefined,
          relays: decoded.data.relays ?? [],
        }
      case 'naddr':
        return {
          type: 'naddr',
          kind: decoded.data.kind,
          pubkey: decoded.data.pubkey,
          identifier: decoded.data.identifier,
          relays: decoded.data.relays ?? [],
        }
      case 'note':
        return {
          type: 'note',
          id: decoded.data,
          relays: [],
        }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Fetch a user's blossom server list (kind 10063) and return server URLs */
export async function fetchBlossomServers(pubkey: string): Promise<string[]> {
  const pool = new SimplePool()
  const relays = [...FALLBACK_RELAYS]

  log('fetchBlossomServers:start', { pubkey: pubkey.slice(0, 16) })

  return new Promise<string[]>(resolve => {
    let settled = false

    function done(servers: string[], reason: string) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      sub.close()
      try {
        pool.close(relays)
      } catch {
        /* ignore */
      }
      log('fetchBlossomServers:done', { reason, count: servers.length })
      resolve(servers)
    }

    let event: NostrEvent | null = null

    const filter: Filter = { kinds: [10063], authors: [pubkey] }
    const sub = pool.subscribeMany(relays, filter, {
      onevent(e) {
        // Keep the newest replaceable event
        if (!event || e.created_at > event.created_at) {
          event = e
        }
      },
      oneose() {
        if (event) {
          const servers = event.tags.filter(t => t[0] === 'server' && t[1]).map(t => t[1])
          done(servers, 'eose')
        } else {
          done([], 'eose-empty')
        }
      },
    })

    const timer = setTimeout(() => {
      if (event) {
        const servers = event.tags.filter(t => t[0] === 'server' && t[1]).map(t => t[1])
        done(servers, 'timeout-with-event')
      } else {
        done([], 'timeout')
      }
    }, FETCH_TIMEOUT_MS)
  })
}

export async function fetchEvent(decoded: DecodedIdentifier): Promise<NostrEvent | null> {
  const pool = new SimplePool()
  const relays = [...new Set([...decoded.relays, ...FALLBACK_RELAYS])]

  const filter: Filter =
    decoded.type === 'naddr'
      ? {
          kinds: [decoded.kind!],
          authors: [decoded.pubkey!],
          '#d': [decoded.identifier!],
        }
      : { ids: [decoded.id!] }

  log('fetchEvent:start', { type: decoded.type, relays, filter })

  return new Promise<NostrEvent | null>(resolve => {
    let settled = false

    function done(result: NostrEvent | null, reason: string) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      sub.close()
      try {
        pool.close(relays)
      } catch {
        /* ignore */
      }
      log('fetchEvent:done', { reason, found: !!result, eventId: result?.id })
      resolve(result)
    }

    const sub = pool.subscribeMany(relays, filter, {
      onevent(event) {
        done(event, 'event')
      },
      oneose() {
        // First relay EOSE with no event — no need to wait for all
        done(null, 'eose')
      },
    })

    const timer = setTimeout(() => {
      log('fetchEvent:timeout', { ms: FETCH_TIMEOUT_MS })
      done(null, 'timeout')
    }, FETCH_TIMEOUT_MS)
  })
}

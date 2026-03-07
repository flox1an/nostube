import { SimplePool } from 'nostr-tools/pool'
import { decode } from 'nostr-tools/nip19'
import type { NostrEvent } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

const FALLBACK_RELAYS = [
  'wss://relay.nostu.be',
  'wss://relay.divine.video',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

const FETCH_TIMEOUT_MS = 4000

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

import { SimplePool } from 'nostr-tools/pool'
import { decode } from 'nostr-tools/nip19'
import type { NostrEvent } from 'nostr-tools/pure'

const FALLBACK_RELAYS = [
  'wss://relay.divine.video',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

const FETCH_TIMEOUT_MS = 3000

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

  try {
    const filter =
      decoded.type === 'naddr'
        ? {
            kinds: [decoded.kind!],
            authors: [decoded.pubkey!],
            '#d': [decoded.identifier!],
          }
        : { ids: [decoded.id!] }

    const event = await Promise.race([
      pool.get(relays, filter),
      new Promise<null>(resolve => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
    ])

    return event
  } finally {
    pool.close(relays)
  }
}

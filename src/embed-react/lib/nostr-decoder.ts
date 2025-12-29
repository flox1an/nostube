import { nip19 } from 'nostr-tools'

export interface EventIdentifier {
  type: 'event'
  data: {
    id: string
    relays: string[]
  }
}

export interface AddressIdentifier {
  type: 'address'
  data: {
    kind: number
    pubkey: string
    identifier: string
    relays: string[]
  }
}

export type DecodedIdentifier = EventIdentifier | AddressIdentifier

/**
 * Decode a NIP-19 identifier (nevent, naddr, note)
 */
export function decodeVideoIdentifier(identifier: string): DecodedIdentifier | null {
  try {
    const decoded = nip19.decode(identifier)

    if (decoded.type === 'nevent') {
      return {
        type: 'event',
        data: {
          id: decoded.data.id,
          relays: decoded.data.relays || [],
        },
      }
    }

    if (decoded.type === 'note') {
      return {
        type: 'event',
        data: {
          id: decoded.data as string,
          relays: [],
        },
      }
    }

    if (decoded.type === 'naddr') {
      return {
        type: 'address',
        data: {
          kind: decoded.data.kind,
          pubkey: decoded.data.pubkey,
          identifier: decoded.data.identifier,
          relays: decoded.data.relays || [],
        },
      }
    }

    return null
  } catch (error) {
    console.error('[Nostr Decoder] Failed to decode identifier:', error)
    return null
  }
}

/**
 * Get default relay list
 */
export function getDefaultRelays(): string[] {
  return ['wss://relay.divine.video', 'wss://relay.damus.io']
}

/**
 * Build final relay list with priorities
 */
export function buildRelayList(hintRelays: string[] = [], customRelays: string[] = []): string[] {
  const relays = [...customRelays, ...hintRelays, ...getDefaultRelays()]
  return [...new Set(relays)]
}

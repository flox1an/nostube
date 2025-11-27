import { nip19 } from 'nostr-tools'

/**
 * Decode a NIP-19 identifier (nevent, naddr, note)
 * @param {string} identifier - NIP-19 encoded string
 * @returns {{type: string, data: Object} | null}
 */
export function decodeVideoIdentifier(identifier) {
  try {
    const decoded = nip19.decode(identifier)

    if (decoded.type === 'nevent') {
      // Regular event: {id, relays}
      return {
        type: 'event',
        data: {
          id: decoded.data.id,
          relays: decoded.data.relays || [],
        },
      }
    }

    if (decoded.type === 'note') {
      // Note: just event ID
      return {
        type: 'event',
        data: {
          id: decoded.data,
          relays: [],
        },
      }
    }

    if (decoded.type === 'naddr') {
      // Addressable event: {kind, pubkey, identifier, relays}
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
 * @returns {string[]}
 */
export function getDefaultRelays() {
  return [
    'wss://relay.divine.video',
    'wss://relay.nostr.band',
    'wss://relay.damus.io',
  ]
}

/**
 * Build final relay list with priorities
 * @param {string[]} hintRelays - Relays from nevent/naddr
 * @param {string[]} customRelays - Custom relays from URL param
 * @returns {string[]}
 */
export function buildRelayList(hintRelays = [], customRelays = []) {
  const relays = [
    ...customRelays,
    ...hintRelays,
    ...getDefaultRelays(),
  ]

  // Remove duplicates while preserving order
  return [...new Set(relays)]
}

import { nip19 } from 'nostr-tools'
import { type EventPointer, type ProfilePointer } from 'nostr-tools/nip19'

/**
 * Safely decode a NIP-19 identifier
 * Returns null if decoding fails
 */
export function decodeNip19(nip19String: string) {
  try {
    return nip19.decode(nip19String)
  } catch (error) {
    console.error('Failed to decode NIP-19 string:', error)
    return null
  }
}

/**
 * Decode a nevent/note NIP-19 identifier to EventPointer
 * Returns null if decoding fails or type doesn't match
 */
export function decodeEventPointer(nevent: string): EventPointer | null {
  try {
    const decoded = nip19.decode(nevent)
    if (decoded.type === 'nevent') {
      return decoded.data
    }
    if (decoded.type === 'note') {
      // note only contains id, construct minimal EventPointer
      return {
        id: decoded.data as string,
        relays: [],
      }
    }
    return null
  } catch (error) {
    console.error('Failed to decode event pointer:', error)
    return null
  }
}

/**
 * Decode a video event identifier (nevent, note, or naddr)
 * Returns an object indicating the type and decoded data
 */
export function decodeVideoEventIdentifier(
  nip19String: string
):
  | { type: 'event'; data: EventPointer }
  | { type: 'address'; data: ReturnType<typeof decodeAddressPointer> }
  | null {
  try {
    const decoded = nip19.decode(nip19String)

    if (decoded.type === 'nevent' || decoded.type === 'note') {
      const eventPointer = decodeEventPointer(nip19String)
      return eventPointer ? { type: 'event', data: eventPointer } : null
    }

    if (decoded.type === 'naddr') {
      const addressPointer = decodeAddressPointer(nip19String)
      return addressPointer ? { type: 'address', data: addressPointer } : null
    }

    return null
  } catch (error) {
    console.error('Failed to decode video event identifier:', error)
    return null
  }
}

/**
 * Decode a nprofile/npub NIP-19 identifier to ProfilePointer
 * Returns null if decoding fails or type doesn't match
 */
export function decodeProfilePointer(nprofile: string): ProfilePointer | null {
  try {
    const decoded = nip19.decode(nprofile)
    if (decoded.type === 'nprofile') {
      return decoded.data
    }
    if (decoded.type === 'npub') {
      // npub only contains pubkey, construct minimal ProfilePointer
      return {
        pubkey: decoded.data as string,
        relays: [],
      }
    }
    return null
  } catch (error) {
    console.error('Failed to decode profile pointer:', error)
    return null
  }
}

/**
 * Decode a naddr NIP-19 identifier to AddressPointer
 * Returns null if decoding fails or type doesn't match
 */
export function decodeAddressPointer(naddr: string) {
  try {
    const decoded = nip19.decode(naddr)
    if (decoded.type === 'naddr') {
      return decoded.data
    }
    return null
  } catch (error) {
    console.error('Failed to decode address pointer:', error)
    return null
  }
}

/**
 * Extract relay URLs from a NIP-19 identifier
 * Returns empty array if no relays or decoding fails
 */
export function extractRelaysFromNip19(nip19String: string): string[] {
  const decoded = decodeNip19(nip19String)
  if (!decoded) return []

  if (decoded.type === 'nevent' || decoded.type === 'nprofile' || decoded.type === 'naddr') {
    return decoded.data.relays || []
  }

  return []
}

/**
 * Combines relays from a NIP-19 identifier with fallback relays
 * NIP-19 relays are prioritized first
 */
export function combineNip19Relays(nip19String: string, fallbackRelays: string[]): string[] {
  const nip19Relays = extractRelaysFromNip19(nip19String)
  return [...new Set([...nip19Relays, ...fallbackRelays])]
}

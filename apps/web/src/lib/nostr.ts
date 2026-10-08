import { nip19 } from 'nostr-tools'
import { sanitizeRelayUrl } from './utils'

/**
 * Helper function to generate NIP-19 encoded link for a video event
 * Addressable events (kinds 34235, 34236) use naddr
 * Regular events (kinds 21, 22) use nevent
 */
export function generateEventLink(
  event: { id: string; kind: number; pubkey: string },
  identifier?: string,
  relays: string[] = []
): string {
  const isAddressable = event.kind === 34235 || event.kind === 34236

  // Sanitize relay URLs to filter out corrupted ones
  const sanitizedRelays = relays.flatMap(url => sanitizeRelayUrl(url))

  if (isAddressable && identifier) {
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier,
      relays: sanitizedRelays,
    })
  }

  return nip19.neventEncode({
    kind: event.kind,
    id: event.id,
    author: event.pubkey,
    relays: sanitizedRelays,
  })
}

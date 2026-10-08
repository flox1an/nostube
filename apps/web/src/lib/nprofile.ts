import { nip19 } from 'nostr-tools'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import type { NostrEvent } from 'nostr-tools'

/**
 * Generate an nprofile with relay hints from an event
 * Uses the relays where the event was seen, or falls back to provided relays
 */
export function nprofileFromEvent(
  pubkey: string,
  event?: NostrEvent,
  fallbackRelays: string[] = []
): string {
  const seenRelays = event ? getSeenRelays(event) : undefined
  const relays = seenRelays ? Array.from(seenRelays) : fallbackRelays

  return nip19.nprofileEncode({
    pubkey,
    relays: relays.slice(0, 5), // Limit to 5 relays to keep URL reasonable
  })
}

/**
 * Generate an nprofile with specific relays
 */
export function nprofileFromPubkey(pubkey: string, relays: string[] = []): string {
  return nip19.nprofileEncode({
    pubkey,
    relays: relays.slice(0, 5), // Limit to 5 relays to keep URL reasonable
  })
}

/**
 * Build the path portion of a profile URL
 * @param nprofile - The nprofile or npub string
 */
export function buildProfilePath(nprofile: string): string {
  return `/p/${nprofile}`
}

/**
 * Build a profile URL from an event (uses event's seen relays)
 * @param pubkey - The author's pubkey
 * @param event - Optional event to extract relay hints from
 * @param fallbackRelays - Fallback relays if event has none
 */
export function buildProfileUrl(
  pubkey: string,
  event?: NostrEvent,
  fallbackRelays: string[] = []
): string {
  const nprofile = nprofileFromEvent(pubkey, event, fallbackRelays)
  return buildProfilePath(nprofile)
}

/**
 * Build a profile URL from a pubkey with explicit relays
 * @param pubkey - The author's pubkey
 * @param relays - Relay hints to include
 */
export function buildProfileUrlFromPubkey(pubkey: string, relays: string[] = []): string {
  const nprofile = nprofileFromPubkey(pubkey, relays)
  return buildProfilePath(nprofile)
}

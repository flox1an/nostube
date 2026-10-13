/**
 * Resolve a NIP-05 address to a bunker:// URI using the nip46 field
 * from the .well-known/nostr.json response.
 *
 * @see NIP-46 appendix: https://github.com/nostr-protocol/nips/blob/master/46.md
 */
import { fetchNostrJson, parseNip05 } from './nip05'

interface Nip05BunkerResult {
  pubkey: string
  relays: string[]
  bunkerUri: string
}

export function isNip05(value: string): boolean {
  if (value.startsWith('bunker://')) return false
  // user@domain or just domain.tld (name defaults to _)
  return (value.includes('@') || value.includes('.')) && parseNip05(value) !== null
}

export async function resolveNip05ToBunkerUri(nip05: string): Promise<Nip05BunkerResult> {
  const { name, domain, data } = await fetchNostrJson(nip05)

  const pubkey = data.names?.[name]
  if (!pubkey) {
    throw new Error(`User "${name}" not found on ${domain}`)
  }

  // Get relays: prefer nip46.relays, fall back to relays[pubkey]
  let relays: string[] = []
  if (data.nip46?.relays && data.nip46.relays.length > 0) {
    relays = data.nip46.relays
  } else if (data.relays?.[pubkey] && data.relays[pubkey].length > 0) {
    relays = data.relays[pubkey]
  }

  if (relays.length === 0) {
    throw new Error(`No relays found for bunker connection on ${domain}`)
  }

  const params = relays.map(r => `relay=${encodeURIComponent(r)}`).join('&')
  const bunkerUri = `bunker://${pubkey}?${params}`

  return { pubkey, relays, bunkerUri }
}

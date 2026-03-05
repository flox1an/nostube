/**
 * Resolve a NIP-05 address to a bunker:// URI using the nip46 field
 * from the .well-known/nostr.json response.
 *
 * @see NIP-46 appendix: https://github.com/nostr-protocol/nips/blob/master/46.md
 */

const NIP05_REGEX = /^(?:([^@]+)@)?([^\s]+)$/

interface Nip05BunkerResult {
  pubkey: string
  relays: string[]
  bunkerUri: string
}

interface NostrJsonResponse {
  names?: Record<string, string>
  relays?: Record<string, string[]>
  nip46?: {
    relays?: string[]
    nostrconnect_url?: string
  }
}

export function isNip05(value: string): boolean {
  return NIP05_REGEX.test(value) && value.includes('@') && !value.startsWith('bunker://')
}

export async function resolveNip05ToBunkerUri(nip05: string): Promise<Nip05BunkerResult> {
  const match = nip05.match(NIP05_REGEX)
  if (!match) {
    throw new Error('Invalid NIP-05 address format')
  }

  const name = match[1] || '_'
  const domain = match[2]

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error(`Failed to reach ${domain} for NIP-05 lookup`)
  }

  if (!response.ok) {
    throw new Error(`NIP-05 lookup failed: ${response.status} from ${domain}`)
  }

  let data: NostrJsonResponse
  try {
    data = await response.json()
  } catch {
    throw new Error(`Invalid JSON response from ${domain}`)
  }

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

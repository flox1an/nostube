/**
 * NIP-05 lookups: `name@domain`, `_@domain` or a bare `domain` (meaning `_@domain`) resolved
 * through `https://<domain>/.well-known/nostr.json?name=<name>`.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/05.md
 */

const NIP05_REGEX = /^(?:([^@]+)@)?([^\s]+)$/
const HEX64 = /^[0-9a-f]{64}$/

export interface NostrJson {
  names?: Record<string, string>
  relays?: Record<string, string[]>
  nip46?: {
    relays?: string[]
    nostrconnect_url?: string
  }
}

/** `name@domain` or bare `domain` split into its parts; null when it is neither. */
export function parseNip05(identifier: string): { name: string; domain: string } | null {
  const match = identifier.trim().match(NIP05_REGEX)
  return match ? { name: match[1] || '_', domain: match[2] } : null
}

/** How a NIP-05 shows: `_@domain` as `@domain`. */
export const displayNip05 = (nip05: string): string =>
  nip05.startsWith('_@') ? nip05.slice(1) : nip05

/** Fetches the domain's nostr.json for the identifier's name; rejects on any failure. */
export async function fetchNostrJson(
  identifier: string
): Promise<{ name: string; domain: string; data: NostrJson }> {
  const parsed = parseNip05(identifier)
  if (!parsed) throw new Error('Invalid NIP-05 address format')
  const { name, domain } = parsed
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`

  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error(`Failed to reach ${domain} for NIP-05 lookup`)
  }
  if (!response.ok) throw new Error(`NIP-05 lookup failed: ${response.status} from ${domain}`)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(`Invalid JSON response from ${domain}`)
  }
  if (!data || typeof data !== 'object') throw new Error(`Invalid JSON response from ${domain}`)
  return { name, domain, data: data as NostrJson }
}

/** The hex pubkey the identifier names and its ws(s) relays from nostr.json; rejects on failure. */
export async function resolveNip05(
  identifier: string
): Promise<{ pubkey: string; relays: string[] }> {
  const { name, domain, data } = await fetchNostrJson(identifier)
  const pubkey = data.names?.[name]
  if (typeof pubkey !== 'string' || !HEX64.test(pubkey)) {
    throw new Error(`User "${name}" not found on ${domain}`)
  }
  const relays: unknown = data.relays?.[pubkey]
  return {
    pubkey,
    relays: Array.isArray(relays)
      ? relays.filter((url): url is string => typeof url === 'string' && /^wss?:\/\//.test(url))
      : [],
  }
}

/** True when the NIP-05 resolves to exactly this pubkey. */
export async function verifyNip05(nip05: string, pubkey: string): Promise<boolean> {
  try {
    return (await resolveNip05(nip05)).pubkey === pubkey
  } catch {
    return false
  }
}

/** A creator's payment address from their NIP-A3 payment targets (kind 10133). */
export interface PaymentTarget {
  /** The lowercase `payto` type, e.g. `bitcoin`, `bip352`, `monero`. */
  type: string
  address: string
  /** A wallet link, for types with a URI scheme and an address that is safe to put in one. */
  uri?: string
}

export const PAYMENT_TARGETS_KIND = 10133

/** Display names of the types NIP-A3 lists; any other type shows as it is. */
export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  bip352: 'Bitcoin (Silent Payments)',
  bip353: 'Bitcoin (BIP-353)',
  bitcoin: 'Bitcoin',
  bitcoincash: 'Bitcoin Cash',
  cashme: 'Cash App',
  ethereum: 'Ethereum',
  lightning: 'Lightning',
  litecoin: 'Litecoin',
  monero: 'Monero',
  nano: 'Nano',
  paypal: 'PayPal',
  revolut: 'Revolut',
  solana: 'Solana',
  tron: 'Tron',
  venmo: 'Venmo',
  zcash: 'Zcash',
}

// ponytail: wallet links only for these schemes; others are copy-only, add a scheme when one is asked for.
const SCHEMES = new Set([
  'bitcoin',
  'bitcoincash',
  'ethereum',
  'lightning',
  'litecoin',
  'monero',
  'zcash',
])
// Addresses of these networks are plain tokens; anything else (`?`, `:`, `/`) gets no link.
const PLAIN = /^[A-Za-z0-9@._+-]+$/

// Spellings seen in published kind-10133 events for the types above.
const ALIASES: Record<string, string> = {
  xmr: 'monero',
  ln: 'lightning',
  zec: 'zcash',
  bch: 'bitcoincash',
  'bitcoin-cash': 'bitcoincash',
}

/** The NIP-A3 type a published type means; silent payments come as "silent payments", "btcsilent", … */
function normalizeType(raw: string): string {
  const type = raw.trim().toLowerCase()
  if (type.includes('silent')) return 'bip352'
  return ALIASES[type] ?? type
}

function uriFor(type: string, address: string): string | undefined {
  if (!PLAIN.test(address)) return undefined
  // BIP-352: a silent payment address goes in the `sp` parameter of a BIP-21 URI.
  if (type === 'bip352') return `bitcoin:?sp=${address}`
  return SCHEMES.has(type) ? `${type}:${address}` : undefined
}

/** The `payto` tags of a kind-10133 event, in order, without empty or duplicate entries. */
export function paymentTargets(event: { tags: string[][] }): PaymentTarget[] {
  const seen = new Set<string>()
  return event.tags.flatMap(([name, rawType, rawAddress]) => {
    const type = rawType ? normalizeType(rawType) : ''
    const address = rawAddress?.trim()
    if (name !== 'payto' || !type || !address || seen.has(`${type} ${address}`)) return []
    seen.add(`${type} ${address}`)
    return [{ type, address, uri: uriFor(type, address) }]
  })
}

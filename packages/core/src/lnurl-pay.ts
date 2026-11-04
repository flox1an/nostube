import { bech32 } from '@scure/base'
import { verifyEvent, type NostrEvent } from 'nostr-tools'
import { getInvoiceAmount } from '@nostube/core/zap-utils'

/** A zap failure the UI shows as `site.zap.errors.<code>` with `params`. */
export class ZapError extends Error {
  constructor(
    readonly code:
      | 'providerFailed'
      | 'providerInvalid'
      | 'invalidAmount'
      | 'videoUnavailable'
      | 'signFailed'
      | 'invoiceFailed'
      | 'invoiceMismatch',
    readonly params: Record<string, string | number> = {}
  ) {
    super(code)
  }
}

/** A validated LNURL-pay endpoint (LUD-06), able to take NIP-57 zaps when `nostrPubkey` is set. */
export interface ZapEndpoint {
  /** The LNURL-pay URL the endpoint was resolved from. */
  lnurl: string
  callback: string
  minSats: number
  maxSats: number
  /** The provider key that must sign the zap receipts; absent when the provider takes no zaps. */
  nostrPubkey?: string
  /** LUD-12 comment length limit, if the provider sets one. */
  commentAllowed?: number
}

/** What a zap receipt must be about to count: a video, or (without `eventId`) the profile itself. */
export interface ZapTarget {
  endpoint: ZapEndpoint
  recipient: string
  eventId?: string
  /** `kind:pubkey:d` of an addressable video. */
  address?: string
}

export interface ZapReceipt {
  sats: number
  bolt11: string
  requestId: string
}

const HEX64 = /^[0-9a-f]{64}$/
const LUD16 = /^([a-z0-9._+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Decodes a bech32 `lnurl1…` to its URL, or returns null. */
function decodeLnurl(value: string): string | null {
  try {
    const { prefix, words } = bech32.decode(value.toLowerCase(), 2000)
    if (prefix !== 'lnurl') return null
    return new TextDecoder().decode(bech32.fromWords(words))
  } catch {
    return null
  }
}

/** The bech32 `lnurl1…` form of an LNURL-pay URL, for the zap request's `lnurl` tag. */
export function encodeLnurl(url: string): string {
  return bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode(url)), 2000)
}

/** The HTTPS LNURL-pay URL of a profile's lud16 (preferred) or lud06; null without a usable one. */
export function lnurlFromProfile(profile: { lud16?: unknown; lud06?: unknown }): string | null {
  if (typeof profile.lud16 === 'string') {
    const match = LUD16.exec(profile.lud16.trim().toLowerCase())
    if (match) return `https://${match[2]}/.well-known/lnurlp/${match[1]}`
  }
  if (typeof profile.lud06 === 'string') return httpsUrl(decodeLnurl(profile.lud06.trim()))
  return null
}

/**
 * Validates an LNURL-pay response (LUD-06, NIP-57 if `allowsNostr`); throws a ZapError for
 * anything unusable. A provider without zaps still takes plain payments.
 */
export function parseZapEndpoint(lnurl: string, body: unknown): ZapEndpoint {
  if (!body || typeof body !== 'object') throw new ZapError('providerInvalid')
  const data = body as Record<string, unknown>
  if (data.status === 'ERROR') {
    throw new ZapError('providerFailed', { reason: String(data.reason ?? 'ERROR') })
  }
  const callback = httpsUrl(data.callback)
  const { minSendable: min, maxSendable: max, nostrPubkey } = data
  if (
    data.tag !== 'payRequest' ||
    !callback ||
    (data.allowsNostr === true && (typeof nostrPubkey !== 'string' || !HEX64.test(nostrPubkey))) ||
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max)
  ) {
    throw new ZapError('providerInvalid')
  }
  // Whole sats only: the sendable msat range must contain at least one.
  const minSats = Math.max(1, Math.ceil(min / 1000))
  const maxSats = Math.floor(max / 1000)
  if (minSats > maxSats) throw new ZapError('providerInvalid')
  const limit = data.commentAllowed
  const commentAllowed =
    typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0 ? limit : undefined
  return {
    lnurl,
    callback,
    minSats,
    maxSats,
    nostrPubkey: data.allowsNostr === true ? (nostrPubkey as string) : undefined,
    commentAllowed,
  }
}

/** Fetches and validates the LNURL-pay endpoint. */
export async function resolveZapEndpoint(
  lnurl: string,
  signal?: AbortSignal
): Promise<ZapEndpoint> {
  let response: Response
  try {
    response = await fetch(lnurl, { signal })
  } catch (err) {
    throw new ZapError('providerFailed', {
      reason: err instanceof Error ? err.message : String(err),
    })
  }
  if (!response.ok) throw new ZapError('providerFailed', { reason: `HTTP ${response.status}` })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ZapError('providerInvalid')
  }
  return parseZapEndpoint(lnurl, body)
}

/** Throws unless `sats` is a whole amount the endpoint accepts. */
export function checkZapAmount(sats: number, endpoint: ZapEndpoint): void {
  if (!Number.isSafeInteger(sats) || sats < endpoint.minSats || sats > endpoint.maxSats) {
    throw new ZapError('invalidAmount', { min: endpoint.minSats, max: endpoint.maxSats })
  }
}

/** Accepts only a mainnet invoice for exactly `sats`; that is what the visitor agreed to pay. */
export function checkInvoice(invoice: unknown, sats: number): string {
  if (
    typeof invoice !== 'string' ||
    !/^lnbc/i.test(invoice) ||
    getInvoiceAmount(invoice) !== sats
  ) {
    throw new ZapError('invoiceMismatch')
  }
  return invoice
}

/** An invoice from the provider; `verify` (LUD-21) can tell whether it was paid. */
export interface Invoice {
  bolt11: string
  verify?: string
}

/**
 * Asks the provider for an invoice of `sats`: a zap with `zapRequest`, else a plain payment
 * carrying `comment` (LUD-12). Only an invoice for exactly `sats` is returned.
 */
export async function fetchInvoice(
  endpoint: ZapEndpoint,
  sats: number,
  { zapRequest, comment }: { zapRequest?: NostrEvent; comment?: string }
): Promise<Invoice> {
  const url = new URL(endpoint.callback)
  url.searchParams.set('amount', String(sats * 1000))
  if (zapRequest) url.searchParams.set('nostr', JSON.stringify(zapRequest))
  else if (comment) url.searchParams.set('comment', comment)
  let data: Record<string, unknown>
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    data = (await response.json()) as Record<string, unknown>
    if (data?.status === 'ERROR') throw new Error(String(data.reason ?? 'ERROR'))
  } catch (err) {
    throw new ZapError('invoiceFailed', {
      reason: err instanceof Error ? err.message : String(err),
    })
  }
  return { bolt11: checkInvoice(data.pr, sats), verify: httpsUrl(data.verify) ?? undefined }
}

/** LUD-21: whether the provider reports `bolt11` as paid; false when it cannot say. */
export async function invoiceSettled(
  verify: string,
  bolt11: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const response = await fetch(verify, { signal })
    const data = (await response.json()) as Record<string, unknown>
    const pr = typeof data.pr === 'string' ? data.pr.toLowerCase() : undefined
    return data.settled === true && (pr === undefined || pr === bolt11.toLowerCase())
  } catch {
    return false
  }
}

const tag = (event: NostrEvent, name: string) => event.tags.find(t => t[0] === name)?.[1]

/**
 * A zap receipt for the target checked per NIP-57 Appendix F: signed by the provider, paying
 * the creator, for this video (or, for a profile target, for no event at all), wrapping a
 * signed zap request whose amount (and lnurl, if present) match the invoice. Null otherwise.
 */
export function validZapReceipt(receipt: NostrEvent, target: ZapTarget): ZapReceipt | null {
  try {
    if (receipt.kind !== 9735 || receipt.pubkey !== target.endpoint.nostrPubkey) return null
    if (!verifyEvent(receipt)) return null
    const bolt11 = tag(receipt, 'bolt11')
    const sats = bolt11 ? getInvoiceAmount(bolt11) : 0
    if (!bolt11 || !Number.isSafeInteger(sats) || sats <= 0) return null

    const request = JSON.parse(tag(receipt, 'description') ?? '') as NostrEvent
    if (request?.kind !== 9734 || !Array.isArray(request.tags) || !verifyEvent(request)) return null
    if (tag(request, 'p') !== target.recipient || tag(receipt, 'p') !== target.recipient)
      return null

    if (target.eventId === undefined) {
      // A profile zap: a zap of some event is not one of the profile.
      if ([request, receipt].some(e => tag(e, 'e') !== undefined || tag(e, 'a') !== undefined))
        return null
    } else {
      const forEvent = tag(request, 'e') === target.eventId && tag(receipt, 'e') === target.eventId
      const forAddress =
        !!target.address &&
        tag(request, 'a') === target.address &&
        tag(receipt, 'a') === target.address
      if (!forEvent && !forAddress) return null
    }

    const amount = tag(request, 'amount')
    if (amount !== undefined && amount !== String(sats * 1000)) return null
    const lnurl = tag(request, 'lnurl')
    if (lnurl !== undefined && (decodeLnurl(lnurl) ?? lnurl) !== target.endpoint.lnurl) return null

    return { sats, bolt11: bolt11.toLowerCase(), requestId: request.id }
  } catch {
    return null
  }
}

/** The valid receipts among `receipts`, one per invoice. */
export function validZapReceipts(receipts: NostrEvent[], target: ZapTarget): ZapReceipt[] {
  const byInvoice = new Map<string, ZapReceipt>()
  for (const receipt of receipts) {
    const valid = validZapReceipt(receipt, target)
    if (valid && !byInvoice.has(valid.bolt11)) byInvoice.set(valid.bolt11, valid)
  }
  return [...byInvoice.values()]
}

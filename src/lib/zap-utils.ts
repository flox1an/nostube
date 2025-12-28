import {
  getZapEndpoint,
  makeZapRequest,
  getSatoshisAmountFromBolt11,
} from 'nostr-tools/nip57'
import type { NostrEvent, EventTemplate } from 'nostr-tools'

export interface ZapRequestParams {
  recipientPubkey: string
  amount: number // in sats
  comment?: string
  relays: string[]
  eventId?: string
  eventKind?: number
}

/**
 * Fetch the LNURL pay endpoint from a user's profile
 */
export async function getRecipientZapEndpoint(profile: NostrEvent): Promise<string | null> {
  return getZapEndpoint(profile)
}

/**
 * Create an unsigned zap request event template
 */
export function createZapRequest(params: ZapRequestParams): EventTemplate {
  const { recipientPubkey, amount, comment, relays, eventId, eventKind } = params

  const amountMsats = amount * 1000

  if (eventId) {
    // Zapping an event
    return makeZapRequest({
      event: {
        id: eventId,
        pubkey: recipientPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: eventKind || 1,
        tags: [],
        content: '',
        sig: '',
      } as NostrEvent,
      amount: amountMsats,
      comment,
      relays,
    })
  } else {
    // Zapping a profile
    return makeZapRequest({
      pubkey: recipientPubkey,
      amount: amountMsats,
      comment,
      relays,
    })
  }
}

/**
 * Request an invoice from the LNURL callback
 */
export async function requestInvoice(
  callback: string,
  amount: number, // in sats
  zapRequest: NostrEvent
): Promise<string> {
  const amountMsats = amount * 1000
  const encodedZapRequest = encodeURIComponent(JSON.stringify(zapRequest))

  const url = new URL(callback)
  url.searchParams.set('amount', amountMsats.toString())
  url.searchParams.set('nostr', encodedZapRequest)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`LNURL request failed: ${response.status}`)
  }

  const data = await response.json()
  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'LNURL request failed')
  }

  if (!data.pr) {
    throw new Error('No invoice returned from LNURL')
  }

  return data.pr
}

/**
 * Parse the amount from a bolt11 invoice
 */
export function getInvoiceAmount(bolt11: string): number {
  return getSatoshisAmountFromBolt11(bolt11)
}

/**
 * Format sats for display (e.g., 21500 -> "21.5k")
 */
export function formatSats(sats: number): string {
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (sats >= 1_000) {
    return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return sats.toString()
}

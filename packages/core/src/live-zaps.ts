import { verifyEvent, type NostrEvent } from 'nostr-tools'
import { getZapRequest } from 'applesauce-common/helpers/zap'
import { parseBolt11 } from 'applesauce-common/helpers/bolt11'
import type { LiveStream } from '@nostube/core/live-stream'

const HEX64 = /^[0-9a-f]{64}$/

export interface LiveZap {
  id: string
  /** Lowercased bolt11, the dedupe key: one paid invoice, one zap. */
  invoice: string
  msats: number
  /** Request signer; undefined for anonymous zaps. */
  sender?: string
  comment: string
  createdAt: number
}

export type ChatRow = { type: 'chat'; event: NostrEvent } | { type: 'zap'; zap: LiveZap }

/** Pubkeys a stream's zaps may pay: host, publisher, and its `zap` split targets. */
export function zapRecipients(stream: LiveStream): Set<string> {
  const keys = [stream.hostPubkey, stream.authorPubkey]
  for (const [name, pubkey] of stream.event.tags) {
    if (name === 'zap' && pubkey && HEX64.test(pubkey)) keys.push(pubkey)
  }
  return new Set(keys)
}

/** The recipient a receipt's signed request names, if it is one of `recipients`. */
export function zapRequestRecipient(
  receipt: NostrEvent,
  recipients: Set<string>
): string | undefined {
  const pTags = getZapRequest(receipt)?.tags.filter(t => t[0] === 'p') ?? []
  return pTags.length === 1 && recipients.has(pTags[0][1]) ? pTags[0][1] : undefined
}

/**
 * NIP-57 Appendix F validation of a zap receipt for this stream. `providers` maps
 * recipient pubkey to the nostrPubkey from their own profile's LNURL endpoint;
 * an unresolved provider means unverified, so null.
 */
export function parseLiveZap(
  receipt: NostrEvent,
  stream: LiveStream,
  recipients: Set<string>,
  providers: ReadonlyMap<string, string | null>
): LiveZap | null {
  if (receipt.kind !== 9735 || !verifyEvent(receipt)) return null
  // Signature, kind, single valid p and relays are checked by getZapRequest.
  const request = getZapRequest(receipt)
  const recipient = zapRequestRecipient(receipt, recipients)
  if (!request || !recipient) return null
  if (receipt.pubkey !== providers.get(recipient)) return null
  if (receipt.tags.find(t => t[0] === 'p')?.[1] !== recipient) return null

  // Bound to this stream by the sender's signature, not by receipt tags.
  const aTags = request.tags.filter(t => t[0] === 'a')
  const bound = aTags.length
    ? aTags.every(t => t[1] === stream.address)
    : request.tags.some(t => t[0] === 'e' && t[1] === stream.event.id)
  if (!bound) return null

  const bolt11 = receipt.tags.find(t => t[0] === 'bolt11')?.[1]
  if (!bolt11) return null
  let msats: number
  try {
    msats = parseBolt11(bolt11).amount ?? 0
  } catch {
    return null
  }
  if (!(msats > 0)) return null
  const requested = request.tags.find(t => t[0] === 'amount')?.[1]
  if (requested !== undefined && Number(requested) !== msats) return null

  const anonymous = request.tags.some(t => t[0] === 'anon')
  return {
    id: receipt.id,
    invoice: bolt11.toLowerCase(),
    msats,
    sender: anonymous ? undefined : request.pubkey,
    comment: request.content,
    createdAt: receipt.created_at,
  }
}

/** Chat messages in order; zaps only when verified, each invoice once. */
export function buildChatRows(
  events: NostrEvent[],
  stream: LiveStream,
  recipients: Set<string>,
  providers: ReadonlyMap<string, string | null>
): ChatRow[] {
  const invoices = new Set<string>()
  const rows: ChatRow[] = []
  for (const event of events) {
    if (event.kind === 1311) {
      rows.push({ type: 'chat', event })
      continue
    }
    const zap = parseLiveZap(event, stream, recipients, providers)
    if (!zap || invoices.has(zap.invoice)) continue
    invoices.add(zap.invoice)
    rows.push({ type: 'zap', zap })
  }
  return rows
}

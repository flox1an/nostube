import type { NostrEvent } from 'nostr-tools'
import { isHexKey } from 'applesauce-core/helpers/string'
import { validZapReceipt, type ZapEndpoint, type ZapReceipt } from './lnurl-pay'
import type { LiveStream } from './live-stream'

export type ChatRow = { type: 'chat'; event: NostrEvent } | { type: 'zap'; zap: ZapReceipt }

/** Pubkeys a stream's zaps may pay: host, publisher, and its `zap` split targets. */
export function zapRecipients(stream: LiveStream): string[] {
  const keys = [stream.hostPubkey, stream.authorPubkey]
  for (const [name, pubkey] of stream.event.tags) {
    if (name === 'zap' && isHexKey(pubkey)) keys.push(pubkey)
  }
  return [...new Set(keys)]
}

/**
 * Chat messages (kind 1311) in order, plus zap receipts verified per NIP-57 Appendix F against
 * the LNURL endpoint of a stream recipient (`endpoints`: recipient pubkey to the endpoint from
 * their own profile). Each paid invoice appears once; unverifiable receipts are dropped.
 */
export function buildChatRows(
  events: NostrEvent[],
  stream: LiveStream,
  endpoints: ReadonlyMap<string, ZapEndpoint>
): ChatRow[] {
  const invoices = new Set<string>()
  const rows: ChatRow[] = []
  for (const event of events) {
    if (event.kind === 1311) {
      rows.push({ type: 'chat', event })
      continue
    }
    let zap: ZapReceipt | null = null
    for (const [recipient, endpoint] of endpoints) {
      zap = validZapReceipt(event, {
        endpoint,
        recipient,
        eventId: stream.event.id,
        address: stream.address,
      })
      if (zap) break
    }
    if (!zap || invoices.has(zap.bolt11)) continue
    invoices.add(zap.bolt11)
    rows.push({ type: 'zap', zap })
  }
  return rows
}

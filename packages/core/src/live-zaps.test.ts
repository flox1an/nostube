import { describe, expect, it } from 'vitest'
import { finalizeEvent, getPublicKey, type NostrEvent } from 'nostr-tools'
import type { LiveStream } from './live-stream'
import type { ZapEndpoint } from './lnurl-pay'
import { buildChatRows, zapRecipients } from './live-zaps'

const [author, host, sender, provider, forger] = [1, 2, 3, 4, 5].map(n =>
  new Uint8Array(32).fill(n)
)
const hostPk = getPublicKey(host)
// NIP-57 example invoice: 10u = 1,000 sats.
const BOLT11 =
  'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0'

const streamEvent = finalizeEvent(
  { kind: 30311, created_at: 1, content: '', tags: [['d', 'show'], ['p', hostPk, '', 'host']] },
  author
)
const address = `30311:${streamEvent.pubkey}:show`
const stream = {
  event: streamEvent,
  address,
  hostPubkey: hostPk,
  authorPubkey: streamEvent.pubkey,
} as LiveStream
const endpoint: ZapEndpoint = {
  lnurl: 'https://pay.example/.well-known/lnurlp/host',
  callback: 'https://pay.example/cb',
  minSats: 1,
  maxSats: 1_000_000,
  nostrPubkey: getPublicKey(provider),
}
const endpoints = new Map([[hostPk, endpoint]])

function receipt({
  signer = provider,
  amount = '1000000',
  a = address,
  extra = [] as string[][],
  createdAt = 10,
} = {}): NostrEvent {
  const request = finalizeEvent(
    {
      kind: 9734,
      created_at: 5,
      content: 'great show',
      tags: [['p', hostPk], ['a', a], ['amount', amount], ['relays', 'wss://nos.lol'], ...extra],
    },
    sender
  )
  // JSON round-trip: drop nostr-tools' cached "verified" flag like a relay event would.
  return JSON.parse(
    JSON.stringify(
      finalizeEvent(
        {
          kind: 9735,
          created_at: createdAt,
          content: '',
          tags: [
            ['p', hostPk],
            ['a', a],
            ['bolt11', BOLT11],
            ['description', JSON.stringify(request)],
          ],
        },
        signer
      )
    )
  )
}

const zaps = (events: NostrEvent[], map = endpoints) =>
  buildChatRows(events, stream, map).flatMap(row => (row.type === 'zap' ? [row.zap] : []))

describe('live zap receipts', () => {
  it('accepts a verified receipt and attributes it to the request signer', () => {
    expect(zaps([receipt()])).toMatchObject([
      { sats: 1000, sender: getPublicKey(sender), comment: 'great show' },
    ])
  })

  it('shows a paid invoice once', () => {
    expect(zaps([receipt(), receipt({ createdAt: 11 })])).toHaveLength(1)
  })

  it('rejects forged, unverified, mismatched or foreign receipts', () => {
    expect(zaps([receipt({ signer: forger })])).toEqual([])
    expect(zaps([receipt()], new Map())).toEqual([])
    expect(zaps([receipt({ amount: '2000000' })])).toEqual([])
    expect(zaps([receipt({ a: `30311:${streamEvent.pubkey}:other` })])).toEqual([])
    const tampered = receipt()
    tampered.created_at += 1
    expect(zaps([tampered])).toEqual([])
  })

  it('keeps anonymous zaps anonymous', () => {
    expect(zaps([receipt({ extra: [['anon']] })])[0].sender).toBeUndefined()
  })

  it('lists host, publisher and zap-split targets once', () => {
    const split = 'f'.repeat(64)
    const recipients = zapRecipients({
      ...stream,
      event: { ...streamEvent, tags: [['zap', split, 'wss://x', '1'], ['zap', 'bad']] },
    })
    expect(recipients).toEqual([hostPk, streamEvent.pubkey, split])
  })
})

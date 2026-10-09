import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import {
  checkInvoice,
  checkZapAmount,
  encodeLnurl,
  lnurlFromProfile,
  parseZapEndpoint,
  validZapReceipt,
  validZapReceipts,
  ZapError,
  type ZapTarget,
} from './zap'

const LNURL = 'https://pay.example/.well-known/lnurlp/creator'
const providerKey = generateSecretKey()
const senderKey = generateSecretKey()
const creator = getPublicKey(generateSecretKey())
const videoId = 'e'.repeat(64)
const address = `34235:${creator}:clip`

const endpoint = parseZapEndpoint(LNURL, {
  tag: 'payRequest',
  callback: 'https://pay.example/callback',
  minSendable: 1000,
  maxSendable: 10_000_000,
  allowsNostr: true,
  nostrPubkey: getPublicKey(providerKey),
  commentAllowed: 100,
})
const target: ZapTarget = { endpoint, recipient: creator, eventId: videoId, address }

/** A bolt11-shaped string whose human-readable part says 1000 sats (`10u`). */
const invoice1000 = (salt = 'q') => `lnbc10u1${salt.repeat(60)}`

function zapError(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (err) {
    return err instanceof ZapError ? err.code : 'other'
  }
}

function receipt({ bolt11 = invoice1000(), signer = providerKey, e = videoId } = {}): NostrEvent {
  const request = finalizeEvent(
    {
      kind: 9734,
      created_at: 1,
      content: '',
      tags: [
        ['p', creator],
        ['e', e],
        ['a', address],
        ['amount', '1000000'],
        ['lnurl', encodeLnurl(LNURL)],
        ['relays', 'wss://relay.example'],
      ],
    },
    senderKey
  )
  return finalizeEvent(
    {
      kind: 9735,
      created_at: 2,
      content: '',
      tags: [
        ['p', creator],
        ['e', e],
        ['a', address],
        ['bolt11', bolt11],
        ['description', JSON.stringify(request)],
      ],
    },
    signer
  )
}

describe('lightning address', () => {
  it('resolves lud16 and lud06 to HTTPS LNURL-pay URLs only', () => {
    expect(lnurlFromProfile({ lud16: 'Creator@Pay.Example' })).toBe(LNURL)
    expect(lnurlFromProfile({ lud06: encodeLnurl(LNURL) })).toBe(LNURL)
    expect(lnurlFromProfile({ lud06: encodeLnurl('http://pay.example/x') })).toBeNull()
    expect(lnurlFromProfile({ lud16: 'not an address' })).toBeNull()
  })
})

describe('provider metadata', () => {
  const valid = {
    tag: 'payRequest',
    callback: 'https://pay.example/cb',
    minSendable: 1000,
    maxSendable: 2_000_000,
    allowsNostr: true,
    nostrPubkey: 'a'.repeat(64),
  }

  it('rejects providers that cannot take a verifiable whole-sat zap', () => {
    expect(zapError(() => parseZapEndpoint(LNURL, { ...valid, allowsNostr: false }))).toBe(
      'providerNoNostr'
    )
    for (const bad of [
      { callback: 'http://pay.example/cb' },
      { nostrPubkey: 'zz' },
      { minSendable: 1500, maxSendable: 1999 },
      { maxSendable: 0 },
      { minSendable: '1000' },
    ]) {
      expect(zapError(() => parseZapEndpoint(LNURL, { ...valid, ...bad }))).toBe('providerInvalid')
    }
    expect(zapError(() => parseZapEndpoint(LNURL, { status: 'ERROR', reason: 'x' }))).toBe(
      'providerFailed'
    )
  })

  it('only accepts safe whole amounts inside the sendable range', () => {
    expect(endpoint).toMatchObject({ minSats: 1, maxSats: 10_000, commentAllowed: 100 })
    for (const sats of [0, -1, 1.5, Number.NaN, 10_001]) {
      expect(zapError(() => checkZapAmount(sats, endpoint))).toBe('invalidAmount')
    }
    expect(zapError(() => checkZapAmount(1000, endpoint))).toBeUndefined()
  })
})

describe('invoice', () => {
  it('accepts only a mainnet invoice for exactly the requested amount', () => {
    expect(checkInvoice(invoice1000(), 1000)).toBe(invoice1000())
    expect(zapError(() => checkInvoice(invoice1000(), 999))).toBe('invoiceMismatch')
    expect(zapError(() => checkInvoice(`lntb10u1${'q'.repeat(60)}`, 1000))).toBe('invoiceMismatch')
    expect(zapError(() => checkInvoice(undefined, 1000))).toBe('invoiceMismatch')
  })
})

describe('zap receipts', () => {
  it('counts a provider-signed receipt for this video once per invoice', () => {
    const valid = receipt()
    expect(validZapReceipt(valid, target)?.sats).toBe(1000)
    // An older version of an addressable video still matches by coordinate.
    expect(validZapReceipt(receipt({ e: 'f'.repeat(64) }), target)?.sats).toBe(1000)
    const total = validZapReceipts([valid, valid, receipt({ bolt11: invoice1000('r') })], target)
    expect(total.reduce((sum, r) => sum + r.sats, 0)).toBe(2000)
  })

  it('rejects fake, mismatched or foreign receipts', () => {
    const genuine = receipt()
    // JSON round trip drops nostr-tools' cached "verified" flag, like an event off the wire.
    const swappedInvoice: NostrEvent = JSON.parse(JSON.stringify(genuine))
    swappedInvoice.tags = genuine.tags.map(t =>
      t[0] === 'bolt11' ? ['bolt11', invoice1000('z')] : t
    )
    // Signed by someone other than the creator's provider.
    expect(validZapReceipt(receipt({ signer: generateSecretKey() }), target)).toBeNull()
    // Provider signature no longer covers the tags.
    expect(validZapReceipt(swappedInvoice, target)).toBeNull()
    // Invoice for 2000 sats, signed request for 1000.
    expect(validZapReceipt(receipt({ bolt11: `lnbc20u1${'q'.repeat(60)}` }), target)).toBeNull()
    // Zero-amount invoice.
    expect(validZapReceipt(receipt({ bolt11: `lnbc1${'q'.repeat(60)}` }), target)).toBeNull()
    // Another event, and no coordinate to match.
    expect(
      validZapReceipt(receipt({ e: 'f'.repeat(64) }), { ...target, address: undefined })
    ).toBeNull()
    // Someone else's zap.
    expect(validZapReceipt(genuine, { ...target, recipient: 'b'.repeat(64) })).toBeNull()
    const otherLnurl = parseZapEndpoint('https://other.example/lnurlp/x', {
      tag: 'payRequest',
      callback: 'https://other.example/cb',
      minSendable: 1000,
      maxSendable: 10_000_000,
      allowsNostr: true,
      nostrPubkey: endpoint.nostrPubkey,
    })
    expect(validZapReceipt(receipt(), { ...target, endpoint: otherLnurl })).toBeNull()
  })
})

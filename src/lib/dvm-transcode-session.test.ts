import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Subject } from 'rxjs'
import type { NostrEvent } from 'nostr-tools'
import { DVMTranscodeSession, DVM_FEEDBACK_KIND, DVM_RESULT_KIND } from './dvm-transcode-session'
import type { DvmBid } from './dvm-utils'

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'event-id',
    pubkey: 'dvm-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    kind: DVM_FEEDBACK_KIND,
    tags: [],
    content: '',
    sig: 'sig',
    ...overrides,
  }
}

function makeMockPool(subject?: Subject<NostrEvent | string>) {
  const sub = subject ?? new Subject<NostrEvent | string>()
  return {
    subscription: vi.fn().mockReturnValue(sub),
    request: vi.fn().mockReturnValue(sub),
    publish: vi.fn().mockResolvedValue(undefined),
    _subject: sub,
  }
}

function makeMockUser(opts: { nip04?: boolean } = {}) {
  return {
    signer: {
      signEvent: vi
        .fn()
        .mockResolvedValue(makeEvent({ kind: DVM_FEEDBACK_KIND, tags: [['status', 'approved']] })),
      ...(opts.nip04
        ? {
            nip04: {
              encrypt: vi.fn().mockResolvedValue('encrypted-content'),
              decrypt: vi.fn().mockResolvedValue('{"status":"processing","message":"50%"}'),
            },
          }
        : { nip04: undefined }),
    },
  }
}

// ── Static helpers ────────────────────────────────────────────────────────────

describe('DVMTranscodeSession.hasEncryptedTag', () => {
  it('returns true when event has encrypted tag', () => {
    const event = makeEvent({ tags: [['encrypted'], ['p', 'some-pubkey']] })
    expect(DVMTranscodeSession.hasEncryptedTag(event)).toBe(true)
  })

  it('returns false when event has no encrypted tag', () => {
    const event = makeEvent({
      tags: [
        ['p', 'some-pubkey'],
        ['status', 'processing'],
      ],
    })
    expect(DVMTranscodeSession.hasEncryptedTag(event)).toBe(false)
  })

  it('returns false for empty tags', () => {
    const event = makeEvent({ tags: [] })
    expect(DVMTranscodeSession.hasEncryptedTag(event)).toBe(false)
  })
})

describe('DVMTranscodeSession.detectPhaseFromMessage', () => {
  it('returns transcoding for undefined', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage(undefined)).toBe('transcoding')
  })

  it('returns transcoding for empty string', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage('')).toBe('transcoding')
  })

  it('returns uploading when message starts with "Uploading"', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage('Uploading to servers...')).toBe('uploading')
  })

  it('returns uploading case-insensitively', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage('uploading 50%')).toBe('uploading')
  })

  it('returns transcoding when message starts with "Transcoding"', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage('Transcoding 720p...')).toBe('transcoding')
  })

  it('returns transcoding when message starts with "Re-encoding"', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage('Re-encoding video...')).toBe('transcoding')
  })

  it('returns transcoding for unrecognised message', () => {
    expect(DVMTranscodeSession.detectPhaseFromMessage('Queued for processing')).toBe('transcoding')
  })
})

// ── collectBids ───────────────────────────────────────────────────────────────

describe('DVMTranscodeSession.collectBids', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with an empty array when no bids arrive before timeout', async () => {
    const pool = makeMockPool()
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.collectBids('request-id', 200)
    vi.advanceTimersByTime(200)

    const bids = await promise
    expect(bids).toEqual([])
    expect(pool.subscription).toHaveBeenCalledWith(
      ['wss://relay.test'],
      [{ kinds: [DVM_FEEDBACK_KIND], '#e': ['request-id'] }]
    )
  })

  it('collects valid payment-required bids', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.collectBids('request-id', 500)

    // Emit a valid payment-required event
    subject.next(
      makeEvent({
        pubkey: 'dvm-pubkey-1',
        kind: DVM_FEEDBACK_KIND,
        tags: [
          ['status', 'payment-required', 'Processing fee'],
          ['amount', '1000'],
          ['e', 'request-id'],
        ],
      })
    )

    vi.advanceTimersByTime(500)
    const bids = await promise

    expect(bids).toHaveLength(1)
    const bid = bids[0] as DvmBid
    expect(bid.pubkey).toBe('dvm-pubkey-1')
    expect(bid.amount).toBe('1000')
  })

  it('ignores EOSE strings and non-bid events', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.collectBids('request-id', 500)

    // Emit EOSE string (should be ignored)
    subject.next('EOSE')
    // Emit a processing event (not payment-required, should not be a bid)
    subject.next(
      makeEvent({
        kind: DVM_FEEDBACK_KIND,
        tags: [
          ['status', 'processing', 'Working...'],
          ['e', 'request-id'],
        ],
      })
    )

    vi.advanceTimersByTime(500)
    const bids = await promise

    expect(bids).toHaveLength(0)
  })

  it('collects multiple bids', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.collectBids('request-id', 500)

    subject.next(
      makeEvent({
        pubkey: 'dvm-1',
        kind: DVM_FEEDBACK_KIND,
        tags: [
          ['status', 'payment-required'],
          ['amount', '0'],
          ['e', 'request-id'],
        ],
      })
    )
    subject.next(
      makeEvent({
        pubkey: 'dvm-2',
        kind: DVM_FEEDBACK_KIND,
        tags: [
          ['status', 'payment-required'],
          ['amount', '500'],
          ['e', 'request-id'],
        ],
      })
    )

    vi.advanceTimersByTime(500)
    const bids = await promise

    expect(bids).toHaveLength(2)
    expect(bids[0].pubkey).toBe('dvm-1')
    expect(bids[0].amount).toBe('0')
    expect(bids[1].pubkey).toBe('dvm-2')
    expect(bids[1].amount).toBe('500')
  })
})

// ── queryForExistingResult ───────────────────────────────────────────────────

describe('DVMTranscodeSession.queryForExistingResult', () => {
  it('returns a parsed video variant for an existing result event', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.queryForExistingResult('request-id', 'dvm-pubkey', 12, '480p')

    subject.next(
      makeEvent({
        kind: DVM_RESULT_KIND,
        content: JSON.stringify({
          type: 'video',
          urls: ['https://cdn.example/video.mp4'],
          resolution: '480p',
          size_bytes: 1024,
          mimetype: 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
        }),
      })
    )

    const video = await promise
    expect(video?.url).toBe('https://cdn.example/video.mp4')
    expect(video?.qualityLabel).toBe('480p')
    expect(video?.duration).toBe(12)
  })

  it('decrypts encrypted existing result events before parsing', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const user = makeMockUser({ nip04: true })
    user.signer.nip04!.decrypt = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: 'video',
        urls: ['https://cdn.example/encrypted.mp4'],
        resolution: '720p',
        size_bytes: 2048,
        mimetype: 'video/mp4',
      })
    )
    const session = new DVMTranscodeSession(['wss://relay.test'], user, pool as never)

    const promise = session.queryForExistingResult('request-id', 'dvm-pubkey')

    subject.next(
      makeEvent({
        kind: DVM_RESULT_KIND,
        content: 'ciphertext',
        tags: [['encrypted']],
      })
    )

    const video = await promise
    expect(user.signer.nip04!.decrypt).toHaveBeenCalledWith('dvm-pubkey', 'ciphertext')
    expect(video?.url).toBe('https://cdn.example/encrypted.mp4')
  })
})

// ── cancel ────────────────────────────────────────────────────────────────────

describe('DVMTranscodeSession.cancel', () => {
  it('unsubscribes all active subscriptions', () => {
    vi.useFakeTimers()
    const unsubscribe = vi.fn()
    const pool = {
      subscription: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockReturnValue({ unsubscribe }),
      }),
    }
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    session.collectBids('req-id', 60_000)
    session.cancel()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

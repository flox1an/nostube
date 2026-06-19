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

// ── subscribeToDvmResponses ────────────────────────────────────────────────────

describe('DVMTranscodeSession.subscribeToDvmResponses', () => {
  const RESULT_CONTENT = {
    type: 'video',
    urls: ['https://cdn.example/out.mp4'],
    resolution: '720p',
    size_bytes: 4096,
    mimetype: 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
  }

  it('resolves with a parsed video variant when a result event arrives', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const onFeedback = vi.fn()
    const promise = session.subscribeToDvmResponses({
      requestEventId: 'request-id',
      dvmPubkey: 'dvm-pubkey',
      originalDuration: 30,
      requestedResolution: '720p',
      onFeedback,
    })

    subject.next(makeEvent({ kind: DVM_RESULT_KIND, content: JSON.stringify(RESULT_CONTENT) }))

    const video = await promise
    expect(video.url).toBe('https://cdn.example/out.mp4')
    expect(video.qualityLabel).toBe('720p')
    expect(video.duration).toBe(30)
    expect(video.videoCodec).toBe('avc1.42E01E')
    // Pool subscribes to both feedback and result kinds for the job
    expect(pool.subscription).toHaveBeenCalledWith(
      ['wss://relay.test'],
      [
        {
          kinds: [DVM_FEEDBACK_KIND, DVM_RESULT_KIND],
          authors: ['dvm-pubkey'],
          '#e': ['request-id'],
        },
      ]
    )
  })

  it('forwards processing feedback with structured progress, phase, speed and queue tags', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const onFeedback = vi.fn()
    const promise = session.subscribeToDvmResponses({
      requestEventId: 'request-id',
      dvmPubkey: 'dvm-pubkey',
      onFeedback,
    })

    subject.next(
      makeEvent({
        kind: DVM_FEEDBACK_KIND,
        tags: [
          ['status', 'processing'],
          ['content', 'Transcoding video'],
          ['progress', '42'],
          ['phase', 'uploading'],
          ['speed', '3.5'],
          ['queue_position', '2'],
          ['eta', '30'],
        ],
      })
    )

    expect(onFeedback).toHaveBeenCalledWith({
      status: 'processing',
      message: 'Transcoding video',
      percentage: 42,
      phase: 'uploading',
      eta: 30,
      speed: 3.5,
      queuePosition: 2,
    })

    // Terminate the job so the internal timers are cleared
    subject.next(makeEvent({ kind: DVM_RESULT_KIND, content: JSON.stringify(RESULT_CONTENT) }))
    await promise
  })

  it('falls back to a percentage parsed from the message when no progress tag is present', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const onFeedback = vi.fn()
    const promise = session.subscribeToDvmResponses({
      requestEventId: 'request-id',
      dvmPubkey: 'dvm-pubkey',
      onFeedback,
    })

    subject.next(
      makeEvent({
        kind: DVM_FEEDBACK_KIND,
        tags: [
          ['status', 'processing'],
          ['content', 'Processing 75% done'],
        ],
      })
    )

    expect(onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        percentage: 75,
        phase: 'transcoding',
        message: 'Processing 75% done',
      })
    )

    subject.next(makeEvent({ kind: DVM_RESULT_KIND, content: JSON.stringify(RESULT_CONTENT) }))
    await promise
  })

  it('rejects when the DVM reports an error status', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.subscribeToDvmResponses({
      requestEventId: 'request-id',
      dvmPubkey: 'dvm-pubkey',
      onFeedback: vi.fn(),
    })

    subject.next(
      makeEvent({
        kind: DVM_FEEDBACK_KIND,
        tags: [['status', 'error', 'Out of disk space']],
      })
    )

    await expect(promise).rejects.toThrow('Out of disk space')
  })

  it('rejects when the result event has no URLs', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const session = new DVMTranscodeSession(['wss://relay.test'], makeMockUser(), pool as never)

    const promise = session.subscribeToDvmResponses({
      requestEventId: 'request-id',
      dvmPubkey: 'dvm-pubkey',
      onFeedback: vi.fn(),
    })

    subject.next(
      makeEvent({
        kind: DVM_RESULT_KIND,
        content: JSON.stringify({ type: 'video', urls: [], resolution: '720p', size_bytes: 0 }),
      })
    )

    await expect(promise).rejects.toThrow('no URLs returned')
  })

  it('decrypts encrypted feedback and result events when the request was encrypted', async () => {
    const subject = new Subject<NostrEvent | string>()
    const pool = makeMockPool(subject)
    const user = makeMockUser({ nip04: true })
    user.signer.nip04!.decrypt = vi.fn().mockImplementation((_pubkey: string, content: string) => {
      if (content === 'fb-cipher') {
        return Promise.resolve('{"status":"processing","message":"Encrypting 50%","eta":20}')
      }
      return Promise.resolve(JSON.stringify(RESULT_CONTENT))
    })
    const session = new DVMTranscodeSession(['wss://relay.test'], user, pool as never)

    const onFeedback = vi.fn()
    const promise = session.subscribeToDvmResponses({
      requestEventId: 'request-id',
      dvmPubkey: 'dvm-pubkey',
      wasEncrypted: true,
      onFeedback,
    })

    subject.next(
      makeEvent({ kind: DVM_FEEDBACK_KIND, content: 'fb-cipher', tags: [['encrypted']] })
    )
    subject.next(makeEvent({ kind: DVM_RESULT_KIND, content: 'res-cipher', tags: [['encrypted']] }))

    const video = await promise
    expect(video.url).toBe('https://cdn.example/out.mp4')
    expect(onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        message: 'Encrypting 50%',
        percentage: 50,
        eta: 20,
      })
    )
  })
})

// ── approveBid ──────────────────────────────────────────────────────────────────

describe('DVMTranscodeSession.approveBid', () => {
  it('signs and publishes a kind-7000 approval event to the write relays', async () => {
    const pool = makeMockPool()
    const user = makeMockUser()
    const session = new DVMTranscodeSession(['wss://relay.test'], user, pool as never)

    const signed = await session.approveBid('request-id', 'dvm-pubkey', ['wss://write.relay'])

    expect(user.signer.signEvent).toHaveBeenCalledTimes(1)
    const template = (user.signer.signEvent as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(template.kind).toBe(DVM_FEEDBACK_KIND)
    expect(template.tags).toEqual(
      expect.arrayContaining([
        ['e', 'request-id'],
        ['p', 'dvm-pubkey'],
        ['status', 'approved'],
      ])
    )
    expect(pool.publish).toHaveBeenCalledWith(['wss://write.relay'], signed)
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

import { describe, expect, it } from 'vitest'
import { finalizeEvent, getPublicKey, type NostrEvent } from 'nostr-tools'
import type { ZapEndpoint } from './lnurl-pay'
import { parseZapGoal, sortZapGoals, zapGoalProgress } from './zap-goal'
import { parseLiveStream } from './live-stream'

const [hostKey, sender, provider, forger] = [2, 3, 4, 5].map(n => new Uint8Array(32).fill(n))
const hostPk = getPublicKey(hostKey)
// NIP-57 example invoice: 10u = 1,000 sats.
const BOLT11 =
  'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnzqpp5jmrh92pfld78spqs78v9euf2385t83uvpwk9ldrlvf6ch7tpascqhp5zvkrmemgth3tufcvflmzjzfvjt023nazlhljz2n9hattj4f8jq8qxqyjw5qcqpjrzjqtc4fc44feggv7065fqe5m4ytjarg3repr5j9el35xhmtfexc42yczarjuqqfzqqqqqqqqlgqqqqqqgq9q9qxpqysgq079nkq507a5tw7xgttmj4u990j7wfggtrasah5gd4ywfr2pjcn29383tphp4t48gquelz9z78p4cq7ml3nrrphw5w6eckhjwmhezhnqpy6gyf0'
const endpoint: ZapEndpoint = {
  lnurl: 'https://pay.example/.well-known/lnurlp/host',
  callback: 'https://pay.example/cb',
  minSats: 1,
  maxSats: 1_000_000,
  nostrPubkey: getPublicKey(provider),
}

const goalEvent = (tags: string[][] = [['amount', '5000000']], created_at = 100) =>
  finalizeEvent({ kind: 9041, created_at, content: ' New camera ', tags }, hostKey)
const goal = parseZapGoal(goalEvent())!

function receipt({
  e = goal.id,
  signer = provider,
  createdAt = 200,
  bolt11 = BOLT11,
} = {}): NostrEvent {
  const request = finalizeEvent(
    {
      kind: 9734,
      created_at: 150,
      content: '',
      tags: [
        ['p', hostPk],
        ['e', e],
        ['amount', '1000000'],
        ['relays', 'wss://nos.lol'],
      ],
    },
    sender
  )
  return JSON.parse(
    JSON.stringify(
      finalizeEvent(
        {
          kind: 9735,
          created_at: createdAt,
          content: '',
          tags: [
            ['p', hostPk],
            ['e', e],
            ['bolt11', bolt11],
            ['description', JSON.stringify(request)],
          ],
        },
        signer
      )
    )
  )
}

describe('parseZapGoal', () => {
  it('reads title, target in sats and only public https/wss values', () => {
    const parsed = parseZapGoal(
      goalEvent([
        ['amount', '5000000'],
        ['relays', 'wss://nos.lol', 'ws://insecure.example', 'wss://localhost'],
        ['image', 'http://x.example/a.png'],
        ['closed_at', '999'],
      ])
    )
    expect(parsed).toMatchObject({
      title: 'New camera',
      targetSats: 5000,
      relays: ['wss://nos.lol'],
      image: undefined,
      closedAt: 999,
      pubkey: hostPk,
    })
  })

  it('drops goals without a usable amount', () => {
    for (const amount of ['0', '-5', '12.5', 'abc', '999']) {
      expect(parseZapGoal(goalEvent([['amount', amount]]))).toBeNull()
    }
    expect(parseZapGoal(goalEvent([]))).toBeNull()
  })
})

describe('zapGoalProgress', () => {
  it('sums verified receipts for the goal and caps the bar at 100%', () => {
    const progress = zapGoalProgress(goal, [receipt()], endpoint)
    expect(progress).toMatchObject({ raisedSats: 1000, percent: 20, reached: false })
    const small = { ...goal, targetSats: 500 }
    expect(zapGoalProgress(small, [receipt()], endpoint)).toMatchObject({
      percent: 100,
      reached: true,
    })
  })

  it('counts a paid invoice once and ignores forged or foreign receipts', () => {
    expect(
      zapGoalProgress(goal, [receipt(), receipt({ createdAt: 201 })], endpoint).raisedSats
    ).toBe(1000)
    expect(zapGoalProgress(goal, [receipt({ signer: forger })], endpoint).raisedSats).toBe(0)
    expect(zapGoalProgress(goal, [receipt({ e: 'a'.repeat(64) })], endpoint).raisedSats).toBe(0)
  })

  it('ignores receipts published after closed_at', () => {
    const closed = { ...goal, closedAt: 199 }
    expect(zapGoalProgress(closed, [receipt({ createdAt: 200 })], endpoint).raisedSats).toBe(0)
    expect(zapGoalProgress(closed, [receipt({ createdAt: 199 })], endpoint).raisedSats).toBe(1000)
  })
})

describe('sortZapGoals', () => {
  it('lists open goals before closed ones, newest first', () => {
    const mk = (created: number, closedAt?: number) => ({
      ...goal,
      event: { ...goal.event, created_at: created },
      closedAt,
    })
    const sorted = sortZapGoals([mk(1, 50), mk(2), mk(3)], 100)
    expect(sorted.map(g => g.event.created_at)).toEqual([3, 2, 1])
    expect(sortZapGoals([mk(5, 50), mk(1)], 100).map(g => g.event.created_at)).toEqual([1, 5])
  })
})

describe('stream goal tag', () => {
  it('exposes a valid goal id only', () => {
    const stream = (value: string) =>
      parseLiveStream(
        finalizeEvent(
          {
            kind: 30311,
            created_at: 100,
            content: '',
            tags: [
              ['d', 'x'],
              ['goal', value],
            ],
          },
          hostKey
        ),
        110
      )
    expect(stream(goal.id)?.goalId).toBe(goal.id)
    expect(stream('nope')?.goalId).toBeUndefined()
  })
})

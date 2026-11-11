import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools'
import { createZapRequest } from './zap-utils'

const key = new Uint8Array(32).fill(7)
const goal = finalizeEvent(
  { kind: 9041, created_at: 1, content: 'Camera', tags: [['amount', '5000000']] },
  key
)
const stream = `30311:${'a'.repeat(64)}:show`

describe('createZapRequest for a zap goal', () => {
  const tags = (address?: string) =>
    createZapRequest({
      recipientPubkey: goal.pubkey,
      amount: 21,
      relays: ['wss://goal.relay'],
      event: goal,
      address,
    }).tags

  it('targets the goal event and, from a stream, also the stream address', () => {
    expect(tags()).toContainEqual(['e', goal.id])
    expect(tags().some(t => t[0] === 'a')).toBe(false)
    expect(tags(stream)).toContainEqual(['a', stream])
    expect(tags(stream)).toContainEqual(['e', goal.id])
    expect(tags(stream)).toContainEqual(['relays', 'wss://goal.relay'])
  })
})

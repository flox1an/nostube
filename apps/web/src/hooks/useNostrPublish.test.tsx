import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  signEvent: vi.fn(),
  publish: vi.fn(),
  add: vi.fn(),
}))
vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'writer', signer: { signEvent: state.signEvent } } }),
}))
vi.mock('./useAppContext', () => ({
  useAppContext: () => ({ config: { relays: [{ url: 'wss://relay.example' }] } }),
}))
vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({ add: state.add, getReplaceable: () => undefined }),
}))
vi.mock('@/nostr/core', () => ({ relayPool: { publish: state.publish } }))
import { useNostrPublish } from './useNostrPublish'

beforeEach(() => vi.clearAllMocks())
it('retries a rejected event without asking the signer for a newer event', async () => {
  const signed = {
    id: 'signed-once',
    pubkey: 'writer',
    sig: 'signature',
    kind: 1,
    tags: [],
    content: 'retry me',
    created_at: 10,
  }
  state.signEvent.mockResolvedValue(signed)
  state.publish
    .mockResolvedValueOnce([
      { from: 'wss://relay.example', ok: false, message: 'blocked: temporarily unavailable' },
    ])
    .mockResolvedValueOnce([{ from: 'wss://relay.example', ok: true }])
  const { result } = renderHook(() => useNostrPublish())
  await act(async () => {
    await expect(
      result.current.publish({ event: { kind: 1, content: 'retry me', tags: [], created_at: 10 } })
    ).rejects.toThrow()
  })
  await act(async () => {
    expect(
      await result.current.publish({
        event: { kind: 1, content: 'retry me', tags: [], created_at: 20 },
      })
    ).toBe(signed)
  })
  expect(state.signEvent).toHaveBeenCalledTimes(1)
  expect(state.publish.mock.calls.map(call => call[1])).toEqual([signed, signed])
  expect(state.add).toHaveBeenCalledWith(signed)
})

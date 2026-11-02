import { act, renderHook } from '@testing-library/react'
import type { NostrEvent } from 'nostr-tools'
import type { PublishResponse, RelayPool } from 'applesauce-relay'
import { describe, expect, it, vi } from 'vitest'
import { usePublications } from './publication'
import { publishRelays, PublishRelaysError, signAndPublish } from './publish-relays'

const event = {
  id: 'e',
  kind: 1,
  pubkey: 'p',
  content: '',
  tags: [],
  created_at: 1,
  sig: 's',
} as NostrEvent

function poolAnswering(
  answer: (url: string, call: number) => PublishResponse | 'throw' | 'blocked'
) {
  const calls: string[] = []
  const publish = vi.fn(async (relays: unknown, published: unknown) => {
    const url = (relays as string[])[0]
    expect(published).toBe(event)
    calls.push(url)
    const result = answer(url, calls.filter(c => c === url).length)
    if (result === 'throw') throw new Error('Timeout has occurred')
    return result === 'blocked' ? [] : [result]
  })
  return { pool: { publish } as unknown as Pick<RelayPool, 'publish'>, calls }
}

describe('publishRelays', () => {
  it('keeps partial success and retries the same event only on failed relays', async () => {
    const { result } = renderHook(() => usePublications())
    const { pool, calls } = poolAnswering((url, call) =>
      url === 'wss://a' || call > 1 ? { ok: true, from: url } : 'throw'
    )

    const responses = await act(() =>
      publishRelays({ pool, event, relays: ['wss://a', 'wss://b'], label: 'Post' })
    )
    expect(responses.map(r => r.ok)).toEqual([true, false])
    const activity = result.current[result.current.length - 1]
    expect(activity.status).toBe('partial')
    expect(activity.targets).toEqual([
      { url: 'wss://a', status: 'confirmed', message: undefined },
      { url: 'wss://b', status: 'timeout', message: 'Timeout has occurred' },
    ])

    await act(() => activity.retry!())
    expect(calls).toEqual(['wss://a', 'wss://b', 'wss://b'])
    const retried = result.current.find(a => a.id === activity.id)!
    expect(retried.status).toBe('success')
    expect(retried.targets?.map(t => t.status)).toEqual(['confirmed', 'confirmed'])
  })

  it('rejects with every relay answer when nothing confirmed, keeping blocked relays as failed', async () => {
    const { result } = renderHook(() => usePublications())
    const { pool } = poolAnswering((url, call) =>
      call > 1
        ? { ok: true, from: url }
        : url === 'ws://blocked'
          ? 'blocked'
          : { ok: false, from: url, message: 'blocked: spam' }
    )
    const onConfirmed = vi.fn()

    const error = await act(() =>
      publishRelays({
        pool,
        event,
        relays: ['wss://a', 'ws://blocked'],
        label: 'Post',
        onConfirmed,
      }).catch(e => e)
    )
    expect(error).toBeInstanceOf(PublishRelaysError)
    expect(error.responses.map((r: PublishResponse) => [r.from, r.ok])).toEqual([
      ['wss://a', false],
      ['ws://blocked', false],
    ])
    expect(onConfirmed).not.toHaveBeenCalled()
    const activity = result.current[result.current.length - 1]
    expect(activity.status).toBe('failed')
    expect(activity.targets?.map(t => [t.url, t.status])).toEqual([
      ['wss://a', 'failed'],
      ['ws://blocked', 'failed'],
    ])

    await act(() => activity.retry!())
    expect(onConfirmed).toHaveBeenCalledOnce()
  })

  it('stays out of the visible store when quiet', async () => {
    const { result } = renderHook(() => usePublications())
    const before = result.current.length
    const { pool } = poolAnswering(url => ({ ok: true, from: url }))

    await act(() => publishRelays({ pool, event, relays: ['wss://a'], quiet: true }))
    expect(result.current).toHaveLength(before)
    await expect(publishRelays({ pool, event, relays: [], quiet: true })).rejects.toThrow(
      PublishRelaysError
    )
  })
})

describe('signAndPublish', () => {
  it('re-sends the same signed event for the same draft and never re-signs it', async () => {
    const { result } = renderHook(() => usePublications())
    const { pool, calls } = poolAnswering((url, call) =>
      call > 2 ? { ok: true, from: url } : { ok: false, from: url, message: 'blocked: spam' }
    )
    const sign = vi.fn(async () => event)
    const onConfirmed = vi.fn()
    const draft = { key: 'draft', sign, pool, relays: ['wss://a'], label: 'Comment', onConfirmed }

    await act(() => expect(signAndPublish(draft)).rejects.toThrow(PublishRelaysError))
    await act(() => expect(signAndPublish(draft)).rejects.toThrow(PublishRelaysError))
    // The status retry lands it; publishing the draft again resolves without another send.
    await act(() => result.current[result.current.length - 1].retry!())
    expect(await signAndPublish(draft)).toBe(event)

    expect(sign).toHaveBeenCalledOnce()
    expect(calls).toEqual(['wss://a', 'wss://a', 'wss://a'])
    expect(onConfirmed).toHaveBeenCalledOnce()
  })
})

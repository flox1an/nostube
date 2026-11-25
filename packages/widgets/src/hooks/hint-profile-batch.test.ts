import { describe, expect, it, vi, beforeEach } from 'vitest'
import { of } from 'rxjs'
import { flushHintProfiles, requestHintProfile, resetHintProfiles } from './hint-profile-batch'
import { PROFILE_REQUEST_TTL_MS, resetProfileRequests } from './profile-request-memo'

function fakePool() {
  const request = vi.fn((_relays: string[], _filters: unknown[]) => of())
  return { pool: { request } as never, request }
}

function fakeStore(missing: string[] = []) {
  const hidden = new Set(missing)
  return {
    store: { hasReplaceable: (_kind: number, pubkey: string) => !hidden.has(pubkey) } as never,
  }
}

describe('hint profile batching', () => {
  beforeEach(() => {
    resetHintProfiles()
    resetProfileRequests()
    vi.useRealTimers()
  })

  it('collapses many authors sharing a relay set into one request', () => {
    const { pool, request } = fakePool()
    const { store } = fakeStore(['a', 'b', 'c'])
    const relays = ['wss://a', 'wss://b']

    requestHintProfile(pool, store, relays, 'a')
    requestHintProfile(pool, store, relays, 'b')
    requestHintProfile(pool, store, relays, 'c')
    expect(request).not.toHaveBeenCalled()

    flushHintProfiles()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(relays, [
      { kinds: [0], authors: ['a', 'b', 'c'], limit: 3 },
    ])
  })

  it('keeps different relay sets apart and skips authors already stored', () => {
    const { pool, request } = fakePool()
    const { store } = fakeStore(['a'])

    requestHintProfile(pool, store, ['wss://x'], 'a')
    requestHintProfile(pool, store, ['wss://x'], 'known')
    requestHintProfile(pool, store, ['wss://y'], 'a')
    flushHintProfiles()

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.map(call => call[0])).toEqual([['wss://x'], ['wss://y']])
    // 'known' was filtered out, so the first batch only asks for 'a'.
    expect(request.mock.calls[0][1]).toEqual([{ kinds: [0], authors: ['a'], limit: 1 }])
  })

  it('flushes on its own timer', () => {
    vi.useFakeTimers()
    const { pool, request } = fakePool()
    const { store } = fakeStore(['a'])

    requestHintProfile(pool, store, ['wss://x'], 'a')
    expect(request).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not re-ask for an author within the TTL, and asks again after it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { pool, request } = fakePool()
    const { store } = fakeStore(['a'])

    requestHintProfile(pool, store, ['wss://x'], 'a')
    vi.advanceTimersByTime(100)
    expect(request).toHaveBeenCalledTimes(1)

    // A card remounts: same author, same hints, profile still not in the store.
    requestHintProfile(pool, store, ['wss://x'], 'a')
    vi.advanceTimersByTime(100)
    expect(request).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(PROFILE_REQUEST_TTL_MS)
    requestHintProfile(pool, store, ['wss://x'], 'a')
    vi.advanceTimersByTime(100)
    expect(request).toHaveBeenCalledTimes(2)
  })
})

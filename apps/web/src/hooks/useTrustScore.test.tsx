import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustScoreResult } from '@/nostr/contextvm'
import type * as ContextVM from '@/nostr/contextvm'

const service = vi.hoisted(() => ({
  calculate: vi.fn(),
  cache: new Map<string, TrustScoreResult>(),
  instance: false,
}))

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: undefined }) }))
vi.mock('@nostube/core/instance-config', () => ({
  getInstanceConfig: () => (service.instance ? {} : null),
}))
vi.mock('@/nostr/contextvm', async importOriginal => ({
  ...(await importOriginal<typeof ContextVM>()),
  connectContextVM: vi.fn().mockResolvedValue({}),
  disconnectContextVM: vi.fn(),
  calculateTrustScores: service.calculate,
}))
vi.mock('@/lib/trust-score-db', () => ({
  getCachedResults: vi.fn(async (pubkeys: string[]) => ({
    results: new Map(pubkeys.map(pubkey => [pubkey, service.cache.get(pubkey) ?? null])),
    stale: new Set<string>(),
  })),
  setCachedResults: vi.fn(async (results: TrustScoreResult[]) => {
    for (const result of results) service.cache.set(result.targetPubkey, result)
  }),
  clearAllCached: vi.fn(),
  pruneExpired: vi.fn(),
}))

const pubkey = 'a'.repeat(64)
const score = (value: number): TrustScoreResult => ({
  sourcePubkey: 'b'.repeat(64),
  targetPubkey: pubkey,
  score: value,
  components: {
    distanceWeight: 1,
    socialDistance: 2,
    normalizedDistance: 0.5,
    validators: { video_creator_activity: { score: value } },
  },
  computedAt: '2026-10-19T12:00:00Z',
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  service.cache.clear()
  service.cache.set(pubkey, score(0.2))
  service.calculate.mockReset()
  service.instance = false
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function tick(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('trust score refresh on activation', () => {
  it('keeps fresh cached scores visible while refreshing and updates every consumer', async () => {
    // Re-import after resetModules to isolate the singleton cache and pending retry timers.
    const hooks = await import('./useTrustScore')
    let response = Promise.withResolvers<TrustScoreResult[]>()
    service.calculate.mockImplementation(() => response.promise)
    const { result, rerender } = renderHook(
      ({ open }) => {
        hooks.useTrustScoreProvider()
        return {
          badge: hooks.useTrustScore(pubkey),
          detail: hooks.useTrustScoreDetail(open ? pubkey : undefined),
        }
      },
      { initialProps: { open: false } }
    )
    await tick()
    expect(result.current.badge.score).toBe(0.2)
    expect(service.calculate).not.toHaveBeenCalled()

    rerender({ open: true })
    await tick()
    expect(result.current.detail.result?.score).toBe(0.2)
    expect(result.current.detail.isLoading).toBe(false)
    expect(service.calculate).toHaveBeenCalledTimes(1)
    rerender({ open: false })
    rerender({ open: true })
    await tick()
    expect(service.calculate).toHaveBeenCalledTimes(1)
    await act(async () => {
      response.resolve([score(0.9)])
    })
    expect(result.current.detail.result?.score).toBe(0.9)
    expect(result.current.badge.score).toBe(0.9)
    expect(result.current.badge.globalScore).toBe(0.9)

    rerender({ open: false })
    response = Promise.withResolvers<TrustScoreResult[]>()
    await tick()
    expect(service.calculate).toHaveBeenCalledTimes(1)
    rerender({ open: true })
    await tick()
    expect(result.current.detail.result?.score).toBe(0.9)
    expect(service.calculate).toHaveBeenCalledTimes(2)
    await act(async () => {
      response.resolve([score(0.7)])
    })
    expect(result.current.badge.score).toBe(0.7)
  })

  it('retains the cache after failed attempts and retries on the next visit', async () => {
    // Re-import after resetModules to isolate the singleton cache and pending retry timers.
    const hooks = await import('./useTrustScore')
    service.calculate.mockRejectedValue(new Error('trust service unavailable'))
    const { result, rerender } = renderHook(
      ({ active }) => {
        hooks.useTrustScoreProvider()
        return hooks.useTrustScoreDetail(active ? pubkey : undefined)
      },
      { initialProps: { active: true } }
    )
    await tick()
    await tick(20000)
    expect(service.calculate).toHaveBeenCalledTimes(3)
    expect(result.current.result?.score).toBe(0.2)
    expect(result.current.isLoading).toBe(false)

    service.calculate.mockResolvedValue([score(0.8)])
    rerender({ active: false })
    rerender({ active: true })
    await tick()
    expect(service.calculate).toHaveBeenCalledTimes(4)
    expect(result.current.result?.score).toBe(0.8)
  })

  it('does not contact ContextVM for server instances', async () => {
    service.instance = true
    // Re-import after resetModules to isolate the singleton cache and pending retry timers.
    const hooks = await import('./useTrustScore')
    const { result } = renderHook(() => hooks.useTrustScoreDetail(pubkey))
    await tick()
    expect(service.calculate).not.toHaveBeenCalled()
    expect(result.current.result).toBeNull()
  })
})

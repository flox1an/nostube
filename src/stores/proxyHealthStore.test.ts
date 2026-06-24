import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAILURE_THRESHOLD, FAILURE_WINDOW_MS, useProxyHealthStore } from './proxyHealthStore'

describe('proxyHealthStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useProxyHealthStore.getState().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in the unknown status', () => {
    expect(useProxyHealthStore.getState().status).toBe('unknown')
  })

  it('markUp sets status to up and clears failure counters', () => {
    const store = useProxyHealthStore.getState()
    store.recordFailure('https://example.com/cat.jpg')
    expect(useProxyHealthStore.getState().recentFailures).toBe(1)

    useProxyHealthStore.getState().markUp()

    const next = useProxyHealthStore.getState()
    expect(next.status).toBe('up')
    expect(next.recentFailures).toBe(0)
    expect(next.lastFailedUrl).toBeNull()
  })

  it('markDown sets status to down without touching failure counters', () => {
    useProxyHealthStore.getState().recordFailure('https://example.com/a.jpg')
    useProxyHealthStore.getState().markDown()

    const state = useProxyHealthStore.getState()
    expect(state.status).toBe('down')
    expect(state.recentFailures).toBe(1)
  })

  it('trips the breaker once FAILURE_THRESHOLD consecutive failures land within the window', () => {
    const url = 'https://example.com/burst.jpg'

    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      useProxyHealthStore.getState().recordFailure(url)
    }
    expect(useProxyHealthStore.getState().status).toBe('unknown')

    useProxyHealthStore.getState().recordFailure(url)
    expect(useProxyHealthStore.getState().status).toBe('down')
    expect(useProxyHealthStore.getState().recentFailures).toBe(FAILURE_THRESHOLD)
  })

  it('resets the failure window when failures arrive after FAILURE_WINDOW_MS', () => {
    useProxyHealthStore.getState().recordFailure('https://example.com/old.jpg')
    expect(useProxyHealthStore.getState().recentFailures).toBe(1)

    vi.advanceTimersByTime(FAILURE_WINDOW_MS + 1)

    useProxyHealthStore.getState().recordFailure('https://example.com/new.jpg')
    expect(useProxyHealthStore.getState().recentFailures).toBe(1)
    expect(useProxyHealthStore.getState().status).toBe('unknown')
  })

  it('recordSuccess clears the failure window and lifts unknown/down back to up', () => {
    useProxyHealthStore.getState().recordFailure('https://example.com/x.jpg')
    useProxyHealthStore.getState().recordFailure('https://example.com/y.jpg')
    expect(useProxyHealthStore.getState().recentFailures).toBe(2)

    useProxyHealthStore.getState().recordSuccess()

    const state = useProxyHealthStore.getState()
    expect(state.status).toBe('up')
    expect(state.recentFailures).toBe(0)
    expect(state.lastFailureAt).toBe(0)
  })

  it('keeps lastFailedUrl on the most recent failure for diagnostics', () => {
    useProxyHealthStore.getState().recordFailure('https://a.example/1.jpg')
    useProxyHealthStore.getState().recordFailure('https://b.example/2.jpg')
    expect(useProxyHealthStore.getState().lastFailedUrl).toBe('https://b.example/2.jpg')
  })
})

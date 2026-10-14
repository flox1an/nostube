import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useViewEventSweeper } from './useViewEventSweeper'

const state = vi.hoisted(() => ({
  user: { pubkey: 'viewer' } as { pubkey: string } | undefined,
  config: { viewTrackingEnabled: true, viewTrackingRelays: ['wss://views.example'] },
}))
vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => ({ user: state.user }) }))
vi.mock('./useAppContext', () => ({ useAppContext: () => ({ config: state.config }) }))

const sweeper = vi.hoisted(() => ({
  flushPendingViewEvents: vi.fn(() => Promise.resolve()),
  resetPublishingToPending: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/view-event-sweeper', () => sweeper)

beforeEach(() => {
  state.user = { pubkey: 'viewer' }
  state.config = { viewTrackingEnabled: true, viewTrackingRelays: ['wss://views.example'] }
  sweeper.flushPendingViewEvents.mockClear()
  sweeper.resetPublishingToPending.mockClear()
})
afterEach(cleanup)

/** Mount the hook and wait for the login flush so later counts start clean. */
async function mountAfterLoginFlush() {
  renderHook(() => useViewEventSweeper())
  await waitFor(() => expect(sweeper.flushPendingViewEvents).toHaveBeenCalledTimes(1))
  sweeper.flushPendingViewEvents.mockClear()
}

describe('useViewEventSweeper triggers', () => {
  it('flushes on login', async () => {
    renderHook(() => useViewEventSweeper())
    await waitFor(() =>
      expect(sweeper.flushPendingViewEvents).toHaveBeenCalledWith('viewer', ['wss://views.example'])
    )
    expect(sweeper.resetPublishingToPending).toHaveBeenCalledWith('viewer')
  })

  it('flushes when the browser comes back online', async () => {
    await mountAfterLoginFlush()
    window.dispatchEvent(new Event('online'))
    expect(sweeper.flushPendingViewEvents).toHaveBeenCalledTimes(1)
    expect(sweeper.flushPendingViewEvents).toHaveBeenCalledWith('viewer', ['wss://views.example'])
  })

  it('flushes when the tab becomes visible', async () => {
    await mountAfterLoginFlush()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sweeper.flushPendingViewEvents).toHaveBeenCalledTimes(1)
  })

  it('does not flush when view tracking is disabled', async () => {
    state.config = { viewTrackingEnabled: false, viewTrackingRelays: ['wss://views.example'] }
    renderHook(() => useViewEventSweeper())
    window.dispatchEvent(new Event('online'))
    await Promise.resolve()
    expect(sweeper.flushPendingViewEvents).not.toHaveBeenCalled()
    expect(sweeper.resetPublishingToPending).not.toHaveBeenCalled()
  })

  it('does not flush without a logged-in user', async () => {
    state.user = undefined
    renderHook(() => useViewEventSweeper())
    window.dispatchEvent(new Event('online'))
    await Promise.resolve()
    expect(sweeper.flushPendingViewEvents).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', async () => {
    const { unmount } = renderHook(() => useViewEventSweeper())
    await waitFor(() => expect(sweeper.flushPendingViewEvents).toHaveBeenCalledTimes(1))
    unmount()
    sweeper.flushPendingViewEvents.mockClear()
    window.dispatchEvent(new Event('online'))
    expect(sweeper.flushPendingViewEvents).not.toHaveBeenCalled()
  })
})

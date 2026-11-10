import { act, renderHook } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react/providers'
import type { NostrEvent, VerifiedEvent } from 'nostr-tools'
import { Subject } from 'rxjs'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveStream } from '@nostube/core/live-stream'
import { useLiveChat } from './useLiveChat'

const state = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('./useAppContext', () => ({ useAppContext: () => ({ pool: state }) }))
vi.mock('./useLiveStreams', () => ({
  useLiveRelayFeed: () => ({ isLoading: false, error: null, relays: ['wss://chat.example'] }),
}))

const address = '30311:' + 'a'.repeat(64) + ':stream'
const stream = {
  address,
  relays: [],
  event: { id: 'e'.repeat(64) },
} as unknown as LiveStream

let counter = 0
const message = (created_at: number): NostrEvent => ({
  id: String(++counter).padStart(64, '0'),
  pubkey: 'b'.repeat(64),
  sig: '',
  kind: 1311,
  created_at,
  content: `m${created_at}`,
  tags: [['a', address]],
})

describe('useLiveChat paging', () => {
  let store: EventStore
  let page: Subject<NostrEvent>
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EventStoreProvider eventStore={store}>{children}</EventStoreProvider>
  )

  beforeEach(() => {
    store = new EventStore()
    store.verifyEvent = (event): event is VerifiedEvent => !!event
    page = new Subject()
    state.request.mockReset().mockReturnValue(page)
  })

  it('requests the page before the oldest chat message and merges it in order', () => {
    const now = Math.floor(Date.now() / 1000)
    store.add(message(now - 10))
    store.add(message(now - 20))
    const { result } = renderHook(() => useLiveChat(stream), { wrapper })

    act(() => result.current.loadOlder())
    expect(state.request).toHaveBeenCalledTimes(1)
    expect(state.request.mock.calls[0][1][0]).toMatchObject({
      '#a': [address],
      until: now - 20,
      limit: 100,
    })

    act(() => {
      page.next(message(now - 30))
      page.next(message(now - 40))
      page.complete()
    })
    expect(result.current.events.map(e => e.content)).toEqual([
      `m${now - 40}`,
      `m${now - 30}`,
      `m${now - 20}`,
      `m${now - 10}`,
    ])
  })

  it('stops requesting once a page brings nothing new, or fails', () => {
    const now = Math.floor(Date.now() / 1000)
    const known = message(now - 10)
    store.add(known)
    const { result } = renderHook(() => useLiveChat(stream), { wrapper })

    act(() => result.current.loadOlder())
    // the inclusive `until` echoes the oldest message back: nothing new, end of history
    act(() => {
      page.next(known)
      page.complete()
    })
    act(() => result.current.loadOlder())
    expect(state.request).toHaveBeenCalledTimes(1)
  })

  it('does not hammer the relays after an error', () => {
    store.add(message(Math.floor(Date.now() / 1000) - 10))
    const { result } = renderHook(() => useLiveChat(stream), { wrapper })

    act(() => result.current.loadOlder())
    act(() => page.error(new Error('relay down')))
    act(() => result.current.loadOlder())
    expect(state.request).toHaveBeenCalledTimes(1)
  })
})

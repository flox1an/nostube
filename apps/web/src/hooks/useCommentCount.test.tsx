import { act, renderHook } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { finalizeEvent, getPublicKey } from 'nostr-tools'
import { expect, it } from 'vitest'
import { useCommentCount } from './useCommentCount'

it('counts event-ID and address comments once and reflects locally added comments immediately', () => {
  const store = new EventStore()
  // jsdom uses a different Uint8Array realm from the signature verifier.
  store.verifyEvent = () => true
  const secret = new Uint8Array(32).fill(5)
  const id = 'a'.repeat(64)
  const address = `34236:${getPublicKey(secret)}:short`
  const comment = (tags: string[][], content: string) =>
    finalizeEvent(
      {
        kind: 1111,
        created_at: 1,
        tags,
        content,
      },
      secret
    )
  const { result } = renderHook(() => useCommentCount({ videoId: id, videoAddress: address }), {
    wrapper: ({ children }) => (
      <EventStoreProvider eventStore={store}>{children}</EventStoreProvider>
    ),
  })
  act(() => {
    store.add(comment([['E', id]], 'by event'))
    store.add(comment([['A', address]], 'by address'))
    store.add(
      comment(
        [
          ['E', id],
          ['A', address],
        ],
        'both tags'
      )
    )
    store.add(comment([['A', `34236:${getPublicKey(secret)}:other`]], 'unrelated'))
  })
  expect(result.current).toBe(3)
})

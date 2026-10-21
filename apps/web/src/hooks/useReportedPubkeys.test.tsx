import { renderHook } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { finalizeEvent, getPublicKey } from 'nostr-tools'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useBlockedPubkeys } from './useReportedPubkeys'

const userKey = new Uint8Array(32).fill(1)
const strangerKey = new Uint8Array(32).fill(2)
const user = { pubkey: getPublicKey(userKey) }

vi.mock('./useCurrentUser', () => ({ useCurrentUser: () => ({ user }) }))
vi.mock('./useSelectedPreset', () => ({
  useSelectedPreset: () => ({ presetContent: { blockedPubkeys: [] } }),
}))
vi.mock('./useMutedPubkeys', () => ({ useMutedPubkeys: () => ({ mutedPubkeys: [] }) }))

const illegalReport = (key: Uint8Array, target: string) =>
  finalizeEvent({ kind: 1984, content: '', tags: [['p', target, 'illegal']], created_at: 1 }, key)

describe('useBlockedPubkeys', () => {
  it("blocks accounts the user reported as illegal, never on a stranger's report", () => {
    const eventStore = new EventStore()
    eventStore.verifyEvent = () => true
    eventStore.add(illegalReport(userKey, 'a'.repeat(64)))
    eventStore.add(illegalReport(strangerKey, 'b'.repeat(64)))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EventStoreProvider eventStore={eventStore}>{children}</EventStoreProvider>
    )

    const { result } = renderHook(() => useBlockedPubkeys(), { wrapper })

    expect(Object.keys(result.current)).toEqual(['a'.repeat(64)])
  })
})

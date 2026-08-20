import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { FollowSetProvider, useFollowSetContext } from './FollowSetContext'
import { useFollowSet } from '@/hooks/useFollowSet'

const mocks = vi.hoisted(() => ({
  addressLoaderFactory: vi.fn(),
  publish: vi.fn(),
}))

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'user-pubkey', signer: {} } }),
}))

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({
    pool: {},
    config: { relays: [] },
  }),
}))

vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ publish: mocks.publish }),
}))

vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({
    add: vi.fn(),
    hasReplaceable: () => false,
    replaceable: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  }),
}))

// `createAddressLoader` is invoked once per subscribing effect. Counting its
// calls is what proves consumers share one loader instead of each mounting
// their own — the fix for the 4x duplicated kind-10020/kind-3 REQ rounds.
vi.mock('applesauce-loaders/loaders', () => ({
  createAddressLoader: (...args: unknown[]) => {
    mocks.addressLoaderFactory(...args)
    return () => ({ subscribe: () => ({ unsubscribe: () => {} }) })
  },
}))

function FollowSetConsumer() {
  useFollowSet()
  return null
}

describe('FollowSetProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates exactly one address loader per kind no matter how many consumers mount', () => {
    // Mirrors the home route: OnboardingDialog, nav chrome, SmartHomePage and
    // useTrustFilter all call useFollowSet(). Before the shared provider each
    // one ran its own effect and its own 1s-buffered address loader.
    render(
      <FollowSetProvider>
        <FollowSetConsumer />
        <FollowSetConsumer />
        <FollowSetConsumer />
        <FollowSetConsumer />
        <FollowSetConsumer />
      </FollowSetProvider>
    )

    // One for kind 10020, one for kind 3 — not five of each.
    expect(mocks.addressLoaderFactory).toHaveBeenCalledTimes(2)
  })

  it('passes bufferTime: 0 so the follow set is not delayed by the default 1s batch window', () => {
    render(
      <FollowSetProvider>
        <FollowSetConsumer />
      </FollowSetProvider>
    )

    for (const call of mocks.addressLoaderFactory.mock.calls) {
      expect(call[1]).toMatchObject({ bufferTime: 0 })
    }
  })

  it('exposes the same followSetLoaded state to every consumer', () => {
    function Probe({ onValue }: { onValue: (loaded: boolean) => void }) {
      const { followSetLoaded } = useFollowSetContext()
      onValue(followSetLoaded)
      return null
    }

    const seen: boolean[] = []
    render(
      <FollowSetProvider>
        <Probe onValue={v => seen.push(v)} />
        <Probe onValue={v => seen.push(v)} />
      </FollowSetProvider>
    )

    expect(seen).toEqual([false, false])
  })
})

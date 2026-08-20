import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks', () => ({
  useCurrentUser: vi.fn(),
}))

vi.mock('@/contexts/FollowSetContext', () => ({
  useFollowSetContext: vi.fn(),
}))

vi.mock('@/hooks/useAccountPersistence', () => ({
  loadActiveAccount: vi.fn(),
}))

vi.mock('./HomePage', () => ({
  HomePage: () => <div data-testid="home-page" />,
}))

vi.mock('./SubscriptionsPage', () => ({
  SubscriptionsPage: () => <div data-testid="subscriptions-page" />,
}))

vi.mock('@/components/PageLoader', () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}))

vi.mock('@/components/page-loaders', () => ({
  SubscriptionsPageLoader: () => <div data-testid="subscriptions-page-loader" />,
}))

import { useCurrentUser } from '@/hooks'
import { useFollowSetContext } from '@/contexts/FollowSetContext'
import { loadActiveAccount } from '@/hooks/useAccountPersistence'
import { SmartHomePage } from './SmartHomePage'

type CurrentUser = { pubkey: string; signer: unknown } | undefined

function setHooks(opts: {
  user: CurrentUser
  activeAccountInStorage: string | null
  followSetLoaded: boolean
  optimisticFollowedPubkeys?: string[]
}) {
  vi.mocked(loadActiveAccount).mockReturnValue(opts.activeAccountInStorage)
  // SmartHomePage only reads `user` off useCurrentUser; bypass the rest
  // of the contract with `as never` rather than coupling tests to the
  // hook's full return shape.
  vi.mocked(useCurrentUser).mockReturnValue({
    user: opts.user,
    users: [],
    loginWithExtension: vi.fn(),
    loginWithNsec: vi.fn(),
    loginWithBunker: vi.fn(),
    logout: vi.fn(),
  } as never)
  vi.mocked(useFollowSetContext).mockReturnValue({
    followSetEvent: null,
    kind3Event: null,
    followSetLoaded: opts.followSetLoaded,
    followedPubkeys: opts.optimisticFollowedPubkeys ?? [],
    optimisticFollowedPubkeys: opts.optimisticFollowedPubkeys ?? [],
  })
}

describe('SmartHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders HomePage when no account is persisted (logged-out cold reload)', () => {
    setHooks({
      user: undefined,
      activeAccountInStorage: null,
      followSetLoaded: true,
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subscriptions-page')).not.toBeInTheDocument()
  })

  it('renders the subscriptions skeleton while a persisted account is being restored', () => {
    // localStorage knows about an account; AccountRestoreInit useEffect
    // hasn't fired yet, so useCurrentUser still returns undefined.
    setHooks({
      user: undefined,
      activeAccountInStorage: 'pubkey-hex',
      followSetLoaded: false,
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('subscriptions-page-loader')).toBeInTheDocument()
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subscriptions-page')).not.toBeInTheDocument()
  })

  it('renders the subscriptions skeleton while the kind 10020 follow set is still loading', () => {
    setHooks({
      user: { pubkey: 'pubkey-hex', signer: {} },
      activeAccountInStorage: 'pubkey-hex',
      followSetLoaded: false,
      optimisticFollowedPubkeys: [],
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('subscriptions-page-loader')).toBeInTheDocument()
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument()
  })

  it('renders SubscriptionsPage once follow set is loaded and contains follows', () => {
    setHooks({
      user: { pubkey: 'pubkey-hex', signer: {} },
      activeAccountInStorage: 'pubkey-hex',
      followSetLoaded: true,
      optimisticFollowedPubkeys: ['a', 'b'],
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('subscriptions-page')).toBeInTheDocument()
    expect(screen.queryByTestId('subscriptions-page-loader')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument()
  })

  it('renders HomePage once follow set is loaded but empty (logged-in, no follows)', () => {
    setHooks({
      user: { pubkey: 'pubkey-hex', signer: {} },
      activeAccountInStorage: 'pubkey-hex',
      followSetLoaded: true,
      optimisticFollowedPubkeys: [],
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })

  it('recovers to HomePage after logout (no persisted account, no user)', () => {
    // Simulates a render after logout cleared both useCurrentUser and
    // localStorage — the gate must not strand the page on PageLoader.
    setHooks({
      user: undefined,
      activeAccountInStorage: null,
      followSetLoaded: false,
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })

  it('renders SubscriptionsPage from the cached follow list before the live set arrives', () => {
    // The cached list lets SubscriptionsPage build its timeline filter on the
    // first render instead of waiting a relay round-trip for kind 10020.
    setHooks({
      user: { pubkey: 'pubkey-hex', signer: {} },
      activeAccountInStorage: 'pubkey-hex',
      followSetLoaded: false,
      optimisticFollowedPubkeys: ['a', 'b'],
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('subscriptions-page')).toBeInTheDocument()
    expect(screen.queryByTestId('subscriptions-page-loader')).not.toBeInTheDocument()
  })
})

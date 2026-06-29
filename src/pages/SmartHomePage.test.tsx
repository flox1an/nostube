import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { UseFollowSetReturn } from '@/hooks/useFollowSet'

vi.mock('@/hooks', () => ({
  useCurrentUser: vi.fn(),
  useFollowSet: vi.fn(),
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

import { useCurrentUser, useFollowSet } from '@/hooks'
import { loadActiveAccount } from '@/hooks/useAccountPersistence'
import { SmartHomePage } from './SmartHomePage'

type CurrentUser = { pubkey: string; signer: unknown } | undefined

function setHooks(opts: {
  user: CurrentUser
  activeAccountInStorage: string | null
  followSet: Partial<UseFollowSetReturn>
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
  const fullFollowSet: UseFollowSetReturn = {
    followedPubkeys: [],
    isLoading: false,
    addFollow: vi.fn(),
    removeFollow: vi.fn(),
    importFromKind3: vi.fn().mockResolvedValue(false),
    hasFollowSet: false,
    followSetLoaded: false,
    hasKind3Contacts: false,
    kind3PubkeyCount: 0,
    importProgress: { phase: 'idle', checked: 0, total: 0, withVideos: 0 },
    cancelImport: vi.fn(),
    ...opts.followSet,
  }
  vi.mocked(useFollowSet).mockReturnValue(fullFollowSet)
}

describe('SmartHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders HomePage when no account is persisted (logged-out cold reload)', () => {
    setHooks({
      user: undefined,
      activeAccountInStorage: null,
      followSet: { followSetLoaded: true },
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
      followSet: { followSetLoaded: false },
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
      followSet: { followSetLoaded: false, followedPubkeys: [] },
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('subscriptions-page-loader')).toBeInTheDocument()
    expect(screen.queryByTestId('page-loader')).not.toBeInTheDocument()
  })

  it('renders SubscriptionsPage once follow set is loaded and contains follows', () => {
    setHooks({
      user: { pubkey: 'pubkey-hex', signer: {} },
      activeAccountInStorage: 'pubkey-hex',
      followSet: { followSetLoaded: true, followedPubkeys: ['a', 'b'] },
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
      followSet: { followSetLoaded: true, followedPubkeys: [] },
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
      followSet: { followSetLoaded: false },
    })
    render(<SmartHomePage />)
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })
})

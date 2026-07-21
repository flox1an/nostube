import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/hooks', () => ({
  useCurrentUser: vi.fn(),
  useFollowSet: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { useCurrentUser, useFollowSet } from '@/hooks'
import { useNavigationMenu } from './useNavigationMenu'

const BETA_PUBKEY = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81'

function renderMenu({
  pubkey,
  hasFollows = false,
}: { pubkey?: string; hasFollows?: boolean } = {}) {
  vi.mocked(useCurrentUser).mockReturnValue({ user: pubkey ? { pubkey } : undefined } as never)
  vi.mocked(useFollowSet).mockReturnValue({
    followedPubkeys: hasFollows ? ['followed-pubkey'] : [],
  } as never)

  return renderHook(() => useNavigationMenu())
}

describe('useNavigationMenu', () => {
  it('keeps every desktop destination available in the compact menu', () => {
    const { result } = renderMenu({ pubkey: 'regular-pubkey', hasFollows: true })

    expect(result.current.compactItems.map(item => item.id)).toEqual([
      'subscriptions',
      'shorts',
      'explore',
      'history',
      'playlists',
      'liked-videos',
      'settings',
    ])
    expect(result.current.compactItems).toEqual([
      ...result.current.navigationItems,
      ...result.current.libraryItems,
      ...result.current.configurationItems,
    ])
  })

  it('shows beta video notes only to the beta account in every menu projection', () => {
    const betaMenu = renderMenu({ pubkey: BETA_PUBKEY, hasFollows: true }).result.current
    const regularMenu = renderMenu({ pubkey: 'regular-pubkey', hasFollows: true }).result.current

    expect(betaMenu.compactItems.map(item => item.id)).toContain('video-notes')
    expect(betaMenu.mobileMoreItems.map(item => item.id)).toContain('video-notes')
    expect(regularMenu.compactItems.map(item => item.id)).not.toContain('video-notes')
    expect(regularMenu.mobileMoreItems.map(item => item.id)).not.toContain('video-notes')
  })

  it('keeps mobile navigation focused while exposing remaining destinations in More', () => {
    const { result } = renderMenu({ pubkey: 'regular-pubkey', hasFollows: true })

    expect(result.current.mobilePrimaryItems.map(item => item.id)).toEqual([
      'subscriptions',
      'shorts',
      'explore',
      'history',
    ])
    expect(result.current.mobileMoreItems.map(item => item.id)).toEqual([
      'playlists',
      'liked-videos',
      'settings',
    ])
  })
})

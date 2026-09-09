import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/hooks', () => ({
  useCurrentUser: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { useCurrentUser } from '@/hooks'
import { useNavigationMenu } from './useNavigationMenu'

const BETA_PUBKEY = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81'

function renderMenu({ pubkey }: { pubkey?: string } = {}) {
  vi.mocked(useCurrentUser).mockReturnValue({ user: pubkey ? { pubkey } : undefined } as never)

  return renderHook(() => useNavigationMenu())
}

describe('useNavigationMenu', () => {
  it('keeps every desktop destination available in the compact menu', () => {
    const { result } = renderMenu({ pubkey: 'regular-pubkey' })

    expect(result.current.compactItems.map(item => item.id)).toEqual([
      'home',
      'shorts',
      'subscriptions',
      'explore',
      'library',
      'settings',
    ])
    expect(result.current.compactItems).toEqual([
      ...result.current.navigationItems,
      ...result.current.libraryItems,
      ...result.current.configurationItems,
    ])
  })

  it('keeps Home/Shorts/Following/Explore/Library stable whether or not a user is signed in', () => {
    const guestMenu = renderMenu().result.current
    const userMenu = renderMenu({ pubkey: 'regular-pubkey' }).result.current

    const stableIds = ['home', 'shorts', 'subscriptions', 'explore', 'library']
    expect(guestMenu.compactItems.filter(i => stableIds.includes(i.id)).map(i => i.id)).toEqual(
      stableIds
    )
    expect(userMenu.compactItems.filter(i => stableIds.includes(i.id)).map(i => i.id)).toEqual(
      stableIds
    )
  })

  it('shows beta video notes only to the beta account in every menu projection', () => {
    const betaMenu = renderMenu({ pubkey: BETA_PUBKEY }).result.current
    const regularMenu = renderMenu({ pubkey: 'regular-pubkey' }).result.current

    expect(betaMenu.compactItems.map(item => item.id)).toContain('video-notes')
    expect(betaMenu.mobileMoreItems.map(item => item.id)).toContain('video-notes')
    expect(regularMenu.compactItems.map(item => item.id)).not.toContain('video-notes')
    expect(regularMenu.mobileMoreItems.map(item => item.id)).not.toContain('video-notes')
  })

  it('keeps mobile navigation focused while exposing remaining destinations in More', () => {
    const { result } = renderMenu({ pubkey: 'regular-pubkey' })

    expect(result.current.mobilePrimaryItems.map(item => item.id)).toEqual([
      'home',
      'shorts',
      'subscriptions',
      'library',
    ])
    expect(result.current.mobileMoreItems.map(item => item.id)).toEqual(['explore', 'settings'])
  })
})

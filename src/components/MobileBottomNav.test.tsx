import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { History, ListVideo, Play, Users } from 'lucide-react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => ({ 'navigation.more': 'More' })[key] ?? key }),
}))

vi.mock('@/hooks/useNavigationMenu', () => ({
  useNavigationMenu: () => ({
    mobilePrimaryItems: [
      { id: 'subscriptions', label: 'Subscriptions', icon: Users, href: '/' },
      { id: 'shorts', label: 'Shorts', icon: Play, href: '/shorts' },
      { id: 'history', label: 'History', icon: History, href: '/history' },
    ],
    mobileMoreItems: [{ id: 'playlists', label: 'Playlists', icon: ListVideo, href: '/playlists' }],
  }),
}))

import { MobileBottomNav } from './MobileBottomNav'

describe('MobileBottomNav', () => {
  it('keeps history in the bottom bar and exposes playlists through More', () => {
    render(
      <MemoryRouter>
        <MobileBottomNav />
      </MemoryRouter>
    )

    const navigation = screen.getByRole('navigation')
    expect(navigation).toHaveTextContent('History')
    expect(navigation).not.toHaveTextContent('Playlists')

    fireEvent.click(screen.getByRole('button', { name: 'More' }))

    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists')
  })
})

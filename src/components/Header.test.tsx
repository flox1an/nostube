import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type * as ReactRouterDom from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : _key),
  }),
}))

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ toggleSidebar: vi.fn() }),
}))
vi.mock('@/hooks/useScrollDirection', () => ({
  useScrollDirection: () => ({ scrollDirection: 'up', isAtTop: true }),
}))
vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))
vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ colorTheme: 'nostube' }),
}))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: undefined }),
}))
vi.mock('@/components/GlobalSearchBar', () => ({ GlobalSearchBar: () => null }))
vi.mock('@/components/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/auth/LoginArea', () => ({ LoginArea: () => null }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouterDom>()
  return { ...actual, useNavigate: () => mockNavigate }
})

import { Header } from './Header'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Header />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Header back navigation on watch pages', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('shows the menu button, not Back, on regular pages', () => {
    renderAt('/')

    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('replaces the menu button with a compact Back control on a watch page', () => {
    Object.defineProperty(window, 'history', {
      value: { ...window.history, state: { idx: 2 } },
      writable: true,
    })

    renderAt('/v/nevent1abc')

    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('falls back to Home from a direct-linked watch page with no in-app history', () => {
    Object.defineProperty(window, 'history', {
      value: { ...window.history, state: { idx: 0 } },
      writable: true,
    })

    renderAt('/v/nevent1abc')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

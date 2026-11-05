import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks', () => ({ useCurrentUser: () => ({ user: undefined }) }))
vi.mock('@nostube/core/instance-config', () => ({ getInstanceConfig: () => null }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({ 'navigation.more': 'More', 'live.title': 'Live' })[key] ?? key,
  }),
}))

import { MobileBottomNav } from './MobileBottomNav'

describe('MobileBottomNav', () => {
  it('lets an anonymous visitor open Live through More and closes the menu on navigation', () => {
    render(
      <MemoryRouter>
        <MobileBottomNav />
        <Routes>
          <Route path="/live" element={<h1>Live streams</h1>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('link', { name: 'Live' }))

    expect(screen.getByRole('heading', { name: 'Live streams' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

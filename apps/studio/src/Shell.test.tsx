import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Shell } from './App'

describe('Shell', () => {
  it('has a link to the public site at the top, opening in a new tab', () => {
    render(
      <Shell>
        <p>content</p>
      </Shell>
    )
    const link = screen.getByRole('link', { name: 'View site' })
    expect(link.getAttribute('href')).toBe('/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('heading', { name: 'Nostube Studio' })).toBeTruthy()
    expect(screen.getByText('content')).toBeTruthy()
  })

  it('offers a log out only once logged in, and calls it', () => {
    const { rerender } = render(
      <Shell>
        <p>content</p>
      </Shell>
    )
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
    const onLogout = vi.fn()
    rerender(
      <Shell onLogout={onLogout}>
        <p>content</p>
      </Shell>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

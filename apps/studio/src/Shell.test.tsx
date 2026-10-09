import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
    expect(screen.getByRole('heading', { name: 'Studio' })).toBeTruthy()
    expect(screen.getByText('content')).toBeTruthy()
  })
})

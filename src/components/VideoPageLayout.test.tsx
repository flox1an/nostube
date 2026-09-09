import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ReactRouterDom from 'react-router-dom'
import { VideoPageLayout } from './VideoPageLayout'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : _key),
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouterDom>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderLayout() {
  return render(
    <MemoryRouter>
      <VideoPageLayout
        cinemaMode={false}
        videoPlayer={<div>player</div>}
        videoInfo={<div>info</div>}
        sidebar={<div>sidebar</div>}
      />
    </MemoryRouter>
  )
}

describe('VideoPageLayout back navigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('goes back through history when the video was reached via in-app navigation', () => {
    Object.defineProperty(window, 'history', {
      value: { ...window.history, state: { idx: 2 } },
      writable: true,
    })

    renderLayout()
    fireEvent.click(screen.getByText('Back'))

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('falls back to Home for a direct-linked video with no in-app history', () => {
    Object.defineProperty(window, 'history', {
      value: { ...window.history, state: { idx: 0 } },
      writable: true,
    })

    renderLayout()
    fireEvent.click(screen.getByText('Back'))

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

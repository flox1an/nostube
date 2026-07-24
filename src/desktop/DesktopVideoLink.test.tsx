import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DesktopVideoLink } from './DesktopVideoLink'

describe('DesktopVideoLink', () => {
  it('opens a desktop player without navigating the discovery window', async () => {
    const openPlayer = vi.fn().mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <DesktopVideoLink
          desktopCoordinator={{ focusMain: vi.fn(), openAuth: vi.fn(), openPlayer }}
          desktopRoute="/desktop/player/nevent1selectedvideo"
          to="/v/nevent1selectedvideo"
        >
          Watch video
        </DesktopVideoLink>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Watch video' }))

    expect(openPlayer).toHaveBeenCalledWith('/desktop/player/nevent1selectedvideo')
  })
})

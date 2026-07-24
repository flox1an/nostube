import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DesktopPlayerShell } from './DesktopPlayerShell'

describe('DesktopPlayerShell', () => {
  it('keeps playback mounted while the inspector changes tabs', () => {
    render(
      <DesktopPlayerShell
        comments={<p>Comments</p>}
        details={<p>Details</p>}
        player={<video data-testid="player" />}
        playlist={<p>Playlist</p>}
      />
    )
    const player = screen.getByTestId('player')

    fireEvent.click(screen.getByRole('tab', { name: 'Comments' }))

    expect(screen.getByTestId('player')).toBe(player)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Comments')
  })

  it('gives playback the full desktop viewport height', () => {
    render(
      <DesktopPlayerShell
        comments={<p>Comments</p>}
        details={<p>Details</p>}
        player={<video />}
        playlist={<p>Playlist</p>}
      />
    )

    expect(screen.getByRole('region', { name: 'Video player' })).toHaveClass('h-dvh')
  })

  it('labels the sidebar as suggestions without a playlist context', () => {
    render(
      <DesktopPlayerShell
        comments={<p>Comments</p>}
        details={<p>Details</p>}
        player={<video />}
        playlist={<p>Suggestions</p>}
        playlistLabel="Suggestions"
      />
    )

    expect(screen.getByRole('tab', { name: 'Suggestions' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Playlist' })).not.toBeInTheDocument()
  })
  it('hides the inspector and restores the player to the full window width', () => {
    render(
      <DesktopPlayerShell
        comments={<p>Comments</p>}
        details={<p>Details</p>}
        player={<video />}
        playlist={<p>Playlist</p>}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide player inspector' }))

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('grid-cols-1')
    expect(screen.getByRole('button', { name: 'Show player inspector' })).toBeInTheDocument()
  })

  it('keeps the desktop header out of the inspector column while the inspector is open', () => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    })

    const { container } = render(
      <DesktopPlayerShell
        comments={<p>Comments</p>}
        details={<p>Details</p>}
        player={<video />}
        playlist={<p>Playlist</p>}
      />
    )

    expect(container.querySelector('header')).toHaveClass('right-104')

    fireEvent.click(screen.getByRole('button', { name: 'Hide player inspector' }))

    expect(container.querySelector('header')).toHaveClass('right-0')
  })

  it('hides the desktop header while the video is fullscreen', () => {
    render(
      <DesktopPlayerShell
        comments={<p>Comments</p>}
        details={<p>Details</p>}
        player={<video />}
        playlist={<p>Playlist</p>}
      />
    )
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    })

    fireEvent(document, new Event('fullscreenchange'))

    expect(screen.queryByRole('link', { name: 'Back to library' })).not.toBeInTheDocument()
  })
})

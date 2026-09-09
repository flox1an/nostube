import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
      const known: Record<string, string> = {
        'navigation.library': 'Library',
        'navigation.history': 'History',
        'navigation.likedVideos': 'Liked videos',
      }
      return known[key] ?? opts?.defaultValue ?? key
    },
  }),
}))
vi.mock('@/hooks', () => ({
  useCurrentUser: vi.fn(),
  useVideoHistory: vi.fn(),
  useLikedEvents: vi.fn(),
  useZappedEvents: vi.fn(),
  usePlaylists: vi.fn(),
  useReadRelays: vi.fn(() => []),
}))

vi.mock('@/components/auth/LoginDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="login-dialog" /> : null,
}))
vi.mock('@/components/auth/SignupDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="signup-dialog" /> : null,
}))

import {
  useCurrentUser,
  useVideoHistory,
  useLikedEvents,
  useZappedEvents,
  usePlaylists,
} from '@/hooks'
import { LibraryPage } from './LibraryPage'

function renderLibrary() {
  return render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>
  )
}

describe('LibraryPage', () => {
  it('shows a sign-in invitation for guests instead of empty collections', () => {
    vi.mocked(useCurrentUser).mockReturnValue({ user: undefined } as never)
    vi.mocked(useVideoHistory).mockReturnValue({ history: [] } as never)
    vi.mocked(useLikedEvents).mockReturnValue({ data: [], likedAddresses: [] } as never)
    vi.mocked(useZappedEvents).mockReturnValue({ data: [], zappedAddresses: [] } as never)
    vi.mocked(usePlaylists).mockReturnValue({ playlists: [], isLoading: false } as never)

    renderLibrary()

    expect(screen.getByText('Sign in to see your library')).toBeInTheDocument()
    expect(screen.queryByText('Nothing watched yet')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
    expect(screen.getByTestId('login-dialog')).toBeInTheDocument()
  })

  it('links each section to its real collection and shows counts for a signed-in viewer', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { pubkey: 'a'.repeat(64) },
    } as never)
    vi.mocked(useVideoHistory).mockReturnValue({
      history: [{ eventId: '1' }, { eventId: '2' }],
    } as never)
    vi.mocked(useLikedEvents).mockReturnValue({
      data: ['ev1', 'ev2'],
      likedAddresses: [],
      isLoading: false,
    } as never)
    vi.mocked(useZappedEvents).mockReturnValue({
      data: ['ev2'], // overlaps with liked; should be deduped
      zappedAddresses: [],
      isLoading: false,
    } as never)
    vi.mocked(usePlaylists).mockReturnValue({ playlists: [], isLoading: false } as never)

    renderLibrary()

    const historyLink = screen.getByRole('link', { name: /History/ })
    expect(historyLink).toHaveAttribute('href', '/history')
    expect(historyLink).toHaveTextContent('2')

    const likedLink = screen.getByRole('link', { name: /Liked videos/ })
    expect(likedLink).toHaveAttribute('href', '/liked-videos')
    expect(likedLink).toHaveTextContent('2') // deduped, not 3

    const playlistsLink = screen.getByRole('link', { name: /Your playlists/ })
    expect(playlistsLink.getAttribute('href')).toMatch(/\/playlists$/)
    expect(playlistsLink).toHaveTextContent('No playlists yet')
  })
})

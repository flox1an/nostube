/// <reference types="node" />
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { eventStore } from '@/nostr/core'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@nostube/core'
import { SearchPage } from './SearchPage'
import * as useSearchVideos from '@/hooks/useSearchVideos'
import i18n from '@/i18n/config'
import type { VideoEvent } from '@nostube/core/video-event'

// Mock the search hook
vi.mock('@/hooks/useSearchVideos', () => ({
  useSearchVideos: vi.fn(),
}))

vi.mock('@/components/VideoTimelinePage', () => ({
  VideoTimelinePage: ({ videos }: { videos: VideoEvent[] }) => (
    <ul>
      {videos.map(video => (
        <li key={video.id}>{video.title}</li>
      ))}
    </ul>
  ),
}))

const video: VideoEvent = {
  id: 'video',
  kind: 21,
  title: 'Long video',
  description: '',
  images: [],
  pubkey: 'creator',
  created_at: 1234567890,
  duration: 120,
  tags: [],
  searchText: '',
  urls: [],
  link: 'video',
  type: 'videos',
  textTracks: [],
  videoVariants: [],
  thumbnailVariants: [],
  origins: [],
  contentWarning: undefined,
}

// Fix IntersectionObserver mock for this test
beforeAll(() => {
  global.IntersectionObserver = class IntersectionObserver {
    constructor(public callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds = []
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
})

// Test wrapper without BrowserRouter (we use MemoryRouter in tests)
function TestWrapper({ children, initialUrl }: { children: React.ReactNode; initialUrl?: string }) {
  const accountManager = new AccountManager()
  const defaultConfig: AppConfig = {
    theme: 'light',
    relays: [{ url: 'wss://relay.nostr.band', name: 'relay.nostr.band', tags: ['read', 'write'] }],
    videoType: 'videos',
    nsfwFilter: 'warning',
  }

  return (
    <MemoryRouter initialEntries={[initialUrl || '/search']}>
      <AppProvider storageKey="test-search-config" defaultConfig={defaultConfig}>
        <AccountsProvider manager={accountManager}>
          <EventStoreProvider eventStore={eventStore}>
            <Routes>
              <Route path="/search" element={children} />
            </Routes>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </MemoryRouter>
  )
}

describe('SearchPage', () => {
  beforeEach(() => {
    // Mock useSearchVideos to return empty results
    vi.mocked(useSearchVideos.useSearchVideos).mockReturnValue({
      videos: [],
      loading: false,
      hasLoaded: true,
      loadMore: vi.fn(),
      presetUnavailable: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty message when query is missing', () => {
    render(
      <TestWrapper initialUrl="/search">
        <SearchPage />
      </TestWrapper>
    )

    // Should show a message prompting user to search
    expect(screen.getByText(/enter a search query/i)).toBeInTheDocument()
  })

  it('applies refinements immediately, retains them after closing, and resets the results', () => {
    vi.mocked(useSearchVideos.useSearchVideos).mockReturnValue({
      videos: [video, { ...video, id: 'short', title: 'Short clip', type: 'shorts' }],
      loading: false,
      hasLoaded: true,
      loadMore: vi.fn(),
      presetUnavailable: false,
    })
    render(
      <TestWrapper initialUrl="/search?q=bitcoin">
        <SearchPage />
      </TestWrapper>
    )
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pages.search.filters') }))
    fireEvent.click(screen.getByRole('radio', { name: 'Shorts' }))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByRole('status')).toHaveTextContent(
      i18n.t('pages.search.filteredResults', { count: 1, loaded: 2 })
    )
    expect(screen.queryByText('Long video')).not.toBeInTheDocument()
    expect(screen.getByText('Short clip')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: i18n.t('pages.search.showResults') }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('pages.search.filtersActive', { count: 1 }) })
    )
    expect(screen.getByRole('radio', { name: 'Shorts' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pages.search.resetFilters') }))
    expect(screen.getByText('Long video')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
      i18n.t('pages.search.filteredResults', { count: 2, loaded: 2 })
    )
  })
})

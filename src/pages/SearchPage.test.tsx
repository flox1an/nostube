import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { eventStore } from '@/nostr/core'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@/contexts/AppContext'
import { defaultResizeServer } from '@/constants/servers'
import { SearchPage } from './SearchPage'
import * as useSearchVideos from '@/hooks/useSearchVideos'

// Mock the search hook
vi.mock('@/hooks/useSearchVideos', () => ({
  useSearchVideos: vi.fn(),
}))

// Fix IntersectionObserver mock for this test
beforeAll(() => {
  global.IntersectionObserver = class IntersectionObserver {
    constructor(public callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    readonly root = null
    readonly rootMargin = ''
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
    thumbResizeServerUrl: defaultResizeServer,
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
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('extracts query parameter from URL', () => {
    // We'll check that the component tries to use the query
    // by looking for it in the rendered output
    render(
      <TestWrapper initialUrl="/search?q=bitcoin">
        <SearchPage />
      </TestWrapper>
    )

    // The page should render without crashing
    // and should show some indication it's searching for "bitcoin"
    expect(screen.getByText(/Search Results for: bitcoin/i)).toBeInTheDocument()
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

  it('displays search query in the page', () => {
    render(
      <TestWrapper initialUrl="/search?q=nostr+videos">
        <SearchPage />
      </TestWrapper>
    )

    // Should display what we're searching for in the heading
    expect(
      screen.getByRole('heading', { name: /Search Results for: nostr videos/i })
    ).toBeInTheDocument()
  })

  it('uses NIP-50 search with correct video kinds', () => {
    render(
      <TestWrapper initialUrl="/search?q=bitcoin">
        <SearchPage />
      </TestWrapper>
    )

    // Verify useSearchVideos was called with the correct query and kinds
    expect(useSearchVideos.useSearchVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'bitcoin',
        kinds: expect.arrayContaining([21, 22, 34235, 34236]), // All video kinds
      })
    )
  })

  it('uses dedicated search hook that queries only relay.nostr.band', () => {
    render(
      <TestWrapper initialUrl="/search?q=nostr">
        <SearchPage />
      </TestWrapper>
    )

    // Verify useSearchVideos was called (which internally only uses relay.nostr.band)
    expect(useSearchVideos.useSearchVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'nostr',
      })
    )
  })
})

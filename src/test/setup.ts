import '@testing-library/jest-dom'
import { vi } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Initialize i18n for tests
i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        common: {
          beta: 'BETA',
          cancel: 'Cancel',
          delete: 'Delete',
          deleting: 'Deleting...',
          loading: 'Loading...',
          loadingMore: 'Loading more...',
          retryNow: 'Retry Now',
        },
        video: {
          noVideosFound: 'No videos found.',
          noMoreVideos: 'No more videos to load.',
          thumbnailUnavailable: 'Thumbnail unavailable',
          unavailable: 'Video Unavailable',
          notFound: 'Video Not Found',
        },
        pages: {
          search: {
            emptyState: 'Enter a search query to find videos',
            resultsFor: 'Search Results for: {{query}}',
            noResults: 'No videos found for "{{query}}".',
          },
        },
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
})

// Mock nostr-idb module since it's only used as a cache
// This prevents IndexedDB initialization errors in tests
vi.mock('nostr-idb', () => ({
  openDB: vi.fn().mockResolvedValue({}),
  getEventsForFilters: vi.fn().mockResolvedValue([]),
  addEvents: vi.fn().mockResolvedValue(undefined),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(_callback => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(_callback => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

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

// Mock applesauce-wallet/helpers which transitively imports @gandlaf21/bc-ur
// (broken ESM with extensionless imports). No tests need wallet functionality.
vi.mock('applesauce-wallet/helpers', () => ({}))

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
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => {
      const keys = Object.keys(store)
      return keys[index] || null
    },
    // Expose stored keys for iteration (needed for Object.getOwnPropertyNames)
    _getStore: () => store,
  }
})()

// Make the mock behave like real localStorage by exposing stored keys as properties
Object.defineProperty(window, 'localStorage', {
  get() {
    // Return a proxy that exposes stored keys as properties
    const store = localStorageMock._getStore()
    return new Proxy(localStorageMock, {
      ownKeys: () => Object.keys(store),
      has: (_target, prop) => typeof prop === 'string' && prop in store,
      get: (target, prop) => {
        if (typeof prop === 'string' && prop in store) {
          return store[prop]
        }
        return (target as any)[prop]
      },
      getOwnPropertyDescriptor: (_target, prop) => {
        if (typeof prop === 'string' && prop in store) {
          return {
            enumerable: true,
            configurable: true,
            value: store[prop],
          }
        }
        return undefined
      },
    })
  },
  configurable: true,
})

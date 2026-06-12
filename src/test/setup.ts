/// <reference types="node" />
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
        errors: {
          debugInfo: 'Debug Info',
        },
        video: {
          noVideosFound: 'No videos found.',
          noMoreVideos: 'No more videos to load.',
          thumbnailUnavailable: 'Thumbnail unavailable',
          unavailable: 'Video Unavailable',
          notFound: 'Video Not Found',
          debugInfoDescription: "Technical details about this video event, relays, and blossom servers",
          pinToProfile: 'Pin to profile',
          unpinFromProfile: 'Unpin from profile',
          contribute: { sourceThumbnailAlt: '{{title}} source thumbnail', unknownResolution: 'unknown resolution', unknownCodec: 'unknown codec', missingDimensionsInfo: 'Source dimensions are missing from the event; exact target sizes will be confirmed after download.', step1: 'Download the selected MP4 source.', step2: 'Re-encode locally into {{count}} selected variant.', step2_other: 'Re-encode locally into {{count}} selected variants.', step3: 'Upload each MP4 to your selected Blossom servers.', step4: 'Publish a kind 1063 event per variant referencing this video.', variantCount: '{{count}} variant', variantCount_other: '{{count}} variants', keepTabOpen: 'Keep this tab open. Re-encoding uses your CPU/GPU.', transcodingVariant: 'Transcoding {{label}}', uploadingVariant: 'Uploading {{label}}', doneInfo: 'Contributed variants are announced via NIP-94 kind 1063 and merged into the quality selector automatically.', errorSignIn: 'Sign in required', errorNoServers: 'Select at least one initial upload server', errorNoVariants: 'Select at least one output variant', errorBadOutput: 'Expected MP4 transcode output', errorGeneric: 'Failed to contribute variant', alertTitle: 'Video Transformation Needed', contributeButton: 'Contribute Variant', menuItem: 'Contribute variant', dialogTitle: 'Contribute a variant', dialogDescription: 'Re-encode this video in your browser and share the result so it plays on more devices.', source: 'Source', changeSource: 'Change source', outputVariants: 'Output variants', uploadToServers: 'Upload to your servers', contributeButton_action: 'Contribute', transcoding: 'Transcoding…', uploading: 'Uploading variants…', publishing: 'Publishing…', done: 'Thanks for contributing', doneDescription: '{{count}} new variant is live. Viewers on more devices will see it in the quality selector.', doneDescription_other: '{{count}} new variants are live. Viewers on more devices will see them in the quality selector.', cancel: 'Cancel', close: 'Close', blockedTitle: 'Cannot contribute right now', blockedDescription: 'One or more prerequisites aren\'t met.', blockedSignIn: 'Sign in required', blockedSignInDescription: 'Contributions are signed with your Nostr key and uploaded to your own Blossom servers.', blockedNoMp4: 'No decodable MP4 source', blockedNoMp4Description: 'This video has no MP4 variant your browser can decode. HLS-only contributions are not supported yet.', blockedWebCodecs: 'Browser cannot encode video', blockedWebCodecsDescription: 'WebCodecs is unavailable. Use a recent Chrome, Edge, or Safari.', downloadedSource: 'Downloaded source', uploadToCount: 'Upload to {{count}} server', uploadToCount_other: 'Upload to {{count}} servers', publishEvents: 'Publish {{count}} kind 1063 event', publishEvents_other: 'Publish {{count}} kind 1063 events', startsAfterTranscode: 'starts after transcoding', startsAfterUpload: 'starts after upload', serverInitial: 'initial upload', serverMirror: 'mirror', queued: 'queued', estimatedSize: '~{{size}} total', alertDescriptionBoth: 'This video could benefit from lower resolution variants and iOS-compatible formats. Contribute a variant to help.', alertDescriptionLowRes: 'This video only has high-resolution variants. Contribute a 720p or lower version for better accessibility.', alertDescriptionIOS: 'This video may not play on iOS devices. Contribute an iOS-compatible H.264 variant.' },
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
        return (target as unknown as Record<string | symbol, unknown>)[prop]
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

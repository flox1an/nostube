import '@testing-library/jest-dom'
import { vi } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { widgetResources } from './src/i18n'

// Node 22+ ships a global localStorage stub without clear(), and this jsdom env exposes
// only an empty placeholder; the persistence tests need a real Storage implementation.
function storage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  }
}
Object.defineProperty(globalThis, 'localStorage', { value: storage() })
Object.defineProperty(globalThis, 'sessionStorage', { value: storage() })

// The widgets' own strings are all the tests need; hosts merge them into their own i18n.
i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: Object.fromEntries(
    Object.entries(widgetResources).map(([lng, translation]) => [lng, { translation }])
  ),
  interpolation: { escapeValue: false },
})

// jsdom lacks these browser APIs; the player and Radix components use them.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() })

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}))

// A class: Radix constructs it with `new`, which an arrow-function mock cannot do.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

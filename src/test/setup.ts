import '@testing-library/jest-dom'
import { vi } from 'vitest'

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

// Mock indexedDB and related classes
const indexedDBMock = {
  open: vi.fn().mockReturnValue({
    onsuccess: null,
    onerror: null,
    result: null,
  }),
  deleteDatabase: vi.fn(),
  databases: vi.fn().mockResolvedValue([]),
  cmp: vi.fn(),
}

// Mock IDBRequest
class IDBRequestMock {
  onsuccess = null
  onerror = null
  result = null
  readyState = 'pending'
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn()
}

// Mock IDBTransaction
class IDBTransactionMock {
  oncomplete = null
  onerror = null
  onabort = null
  objectStore = vi.fn()
  abort = vi.fn()
  db = null
  mode = 'readonly'
}

// Mock IDBIndex
class IDBIndexMock {
  name = 'test-index'
  keyPath = null
  objectStore = null
  unique = false
  multiEntry = false
  count = vi.fn()
  get = vi.fn()
  getAll = vi.fn()
  getAllKeys = vi.fn()
  getKey = vi.fn()
}

// Mock IDBCursor
class IDBCursorMock {
  key = null
  primaryKey = null
  source = null
  direction = 'next'
  advance = vi.fn()
  continue = vi.fn()
  continuePrimaryKey = vi.fn()
  delete = vi.fn()
  update = vi.fn()
}

// Mock IDBKeyRange
class IDBKeyRangeMock {
  lower = null
  upper = null
  lowerOpen = false
  upperOpen = false
  static bound = vi.fn()
  static only = vi.fn()
  static lowerBound = vi.fn()
  static upperBound = vi.fn()
  includes = vi.fn()
}

// Mock IDBObjectStore
class IDBObjectStoreMock {
  name = 'test-store'
  keyPath = null
  indexNames = []
  add = vi.fn()
  clear = vi.fn()
  count = vi.fn()
  delete = vi.fn()
  get = vi.fn()
  getAll = vi.fn()
  getAllKeys = vi.fn()
  getKey = vi.fn()
  put = vi.fn()
  createIndex = vi.fn()
  deleteIndex = vi.fn()
  index = vi.fn()
}

// Mock IDBDatabase
class IDBDatabaseMock {
  name = 'test-db'
  version = 1
  objectStoreNames = []
  close = vi.fn()
  createObjectStore = vi.fn()
  deleteObjectStore = vi.fn()
  transaction = vi.fn()
}

Object.defineProperty(window, 'indexedDB', {
  value: indexedDBMock,
  writable: true,
})

Object.defineProperty(global, 'indexedDB', {
  value: indexedDBMock,
  writable: true,
})

Object.defineProperty(global, 'IDBRequest', {
  value: IDBRequestMock,
  writable: true,
})

Object.defineProperty(global, 'IDBTransaction', {
  value: IDBTransactionMock,
  writable: true,
})

Object.defineProperty(global, 'IDBObjectStore', {
  value: IDBObjectStoreMock,
  writable: true,
})

Object.defineProperty(global, 'IDBDatabase', {
  value: IDBDatabaseMock,
  writable: true,
})

Object.defineProperty(global, 'IDBIndex', {
  value: IDBIndexMock,
  writable: true,
})

Object.defineProperty(global, 'IDBCursor', {
  value: IDBCursorMock,
  writable: true,
})

Object.defineProperty(global, 'IDBKeyRange', {
  value: IDBKeyRangeMock,
  writable: true,
})

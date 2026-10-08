import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getItemsFromStorage,
  getStorageLastModified,
  saveItemsToStorage,
  addItemToStorage,
  updateItemInStorage,
  deleteItemFromStorage,
  mergeItemsFromNostr,
} from './draft-persistence-storage'

interface TestItem {
  id: string
  updatedAt: number
  name: string
}

const KEY = 'test_items'

function makeItem(id: string, updatedAt: number, name: string): TestItem {
  return { id, updatedAt, name }
}

beforeEach(() => {
  localStorage.clear()
})

describe('getItemsFromStorage', () => {
  it('returns empty array when nothing stored', () => {
    expect(getItemsFromStorage<TestItem>(KEY)).toEqual([])
  })

  it('returns items from valid storage', () => {
    const items = [makeItem('1', 100, 'a')]
    localStorage.setItem(KEY, JSON.stringify({ version: '1', lastModified: 100, items }))
    expect(getItemsFromStorage<TestItem>(KEY)).toEqual(items)
  })

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem(KEY, 'not-json')
    expect(getItemsFromStorage<TestItem>(KEY)).toEqual([])
  })
})

describe('getStorageLastModified', () => {
  it('returns 0 when nothing stored', () => {
    expect(getStorageLastModified(KEY)).toBe(0)
  })

  it('returns lastModified from storage', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: '1', lastModified: 500, items: [] }))
    expect(getStorageLastModified(KEY)).toBe(500)
  })

  it('returns 0 on corrupt JSON', () => {
    localStorage.setItem(KEY, '{bad')
    expect(getStorageLastModified(KEY)).toBe(0)
  })
})

describe('saveItemsToStorage', () => {
  it('saves items with version and lastModified wrapper', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    const items = [makeItem('1', now, 'a')]
    saveItemsToStorage(KEY, items)

    const stored = JSON.parse(localStorage.getItem(KEY)!)
    expect(stored.version).toBe('1')
    expect(stored.lastModified).toBe(now)
    expect(stored.items).toEqual(items)
    vi.useRealTimers()
  })
})

describe('addItemToStorage', () => {
  it('adds an item to empty storage', () => {
    const item = makeItem('1', 100, 'first')
    addItemToStorage(KEY, item, 5)
    expect(getItemsFromStorage<TestItem>(KEY)).toEqual([item])
  })

  it('throws when maxItems reached', () => {
    const items = [makeItem('1', 100, 'a'), makeItem('2', 200, 'b')]
    saveItemsToStorage(KEY, items)
    expect(() => addItemToStorage(KEY, makeItem('3', 300, 'c'), 2)).toThrow(
      'Maximum 2 items allowed'
    )
  })
})

describe('updateItemInStorage', () => {
  it('updates an existing item and sets updatedAt', () => {
    const now = 50000
    vi.setSystemTime(now)
    saveItemsToStorage(KEY, [makeItem('1', 100, 'old')])

    const result = updateItemInStorage<TestItem>(KEY, '1', { name: 'new' })
    expect(result).toBeDefined()
    expect(result!.name).toBe('new')
    expect(result!.updatedAt).toBe(now)

    const stored = getItemsFromStorage<TestItem>(KEY)
    expect(stored[0].name).toBe('new')
    vi.useRealTimers()
  })

  it('returns undefined for non-existent id', () => {
    saveItemsToStorage(KEY, [makeItem('1', 100, 'a')])
    expect(updateItemInStorage<TestItem>(KEY, 'missing', { name: 'x' })).toBeUndefined()
  })
})

describe('deleteItemFromStorage', () => {
  it('removes an item by id', () => {
    saveItemsToStorage(KEY, [makeItem('1', 100, 'a'), makeItem('2', 200, 'b')])
    deleteItemFromStorage(KEY, '1')
    const items = getItemsFromStorage<TestItem>(KEY)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('2')
  })

  it('does nothing if id not found', () => {
    saveItemsToStorage(KEY, [makeItem('1', 100, 'a')])
    deleteItemFromStorage(KEY, 'missing')
    expect(getItemsFromStorage<TestItem>(KEY)).toHaveLength(1)
  })
})

describe('mergeItemsFromNostr', () => {
  it('adds new Nostr items when Nostr event is newer than local lastModified', () => {
    // local lastModified is in ms
    saveItemsToStorage(KEY, [makeItem('1', 100, 'local')])
    const localLastModified = getStorageLastModified(KEY)

    // nostrEventTimestamp is in seconds, must be > localLastModified in ms
    const nostrTimestamp = Math.floor(localLastModified / 1000) + 10
    const nostrItems = [makeItem('2', 200, 'from-nostr')]

    const merged = mergeItemsFromNostr<TestItem>(KEY, nostrItems, nostrTimestamp)
    expect(merged).toHaveLength(2)
    expect(merged.map(i => i.id)).toContain('2')
  })

  it('does not add new Nostr items when Nostr event is older', () => {
    vi.setSystemTime(5_000_000)
    saveItemsToStorage(KEY, [makeItem('1', 100, 'local')])
    vi.useRealTimers()

    // Nostr event is 1 second in unix time = 1000ms, which is < 5_000_000 lastModified
    const nostrItems = [makeItem('2', 200, 'from-nostr')]
    const merged = mergeItemsFromNostr<TestItem>(KEY, nostrItems, 1)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('1')
  })

  it('overwrites local item when Nostr item has newer updatedAt', () => {
    saveItemsToStorage(KEY, [makeItem('1', 100, 'old-local')])

    const nostrItems = [makeItem('1', 999, 'newer-nostr')]
    const merged = mergeItemsFromNostr<TestItem>(KEY, nostrItems, 999)
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('newer-nostr')
  })

  it('keeps local item when local has newer updatedAt', () => {
    saveItemsToStorage(KEY, [makeItem('1', 999, 'newer-local')])

    const nostrItems = [makeItem('1', 100, 'old-nostr')]
    const merged = mergeItemsFromNostr<TestItem>(KEY, nostrItems, 999)
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('newer-local')
  })

  it('returns items sorted by updatedAt descending', () => {
    saveItemsToStorage(KEY, [makeItem('1', 100, 'a'), makeItem('2', 300, 'b')])
    const localLastModified = getStorageLastModified(KEY)
    const nostrTimestamp = Math.floor(localLastModified / 1000) + 10

    const nostrItems = [makeItem('3', 200, 'c')]
    const merged = mergeItemsFromNostr<TestItem>(KEY, nostrItems, nostrTimestamp)
    expect(merged.map(i => i.updatedAt)).toEqual([300, 200, 100])
  })
})

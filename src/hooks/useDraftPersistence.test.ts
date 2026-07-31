import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftPersistence } from './useDraftPersistence'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null }),
}))

vi.mock('./useAppContext', () => ({
  useAppContext: () => ({
    config: { relays: [] },
    pool: {},
  }),
}))

vi.mock('@/contexts/PrivateRelaysContext', () => ({
  usePrivateRelays: () => ({
    relays: [],
    publish: vi.fn(),
  }),
}))

vi.mock('applesauce-loaders/loaders', () => ({
  createAddressLoader: () => () => ({
    subscribe: () => ({ unsubscribe: () => {} }),
  }),
}))

// ---------------------------------------------------------------------------
// Test item type
// ---------------------------------------------------------------------------

interface TestItem {
  id: string
  updatedAt: number
  title: string
}

const STORAGE_KEY = 'test_draft_persistence'
const NOSTR_ID = 'test-drafts'

function makeItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    id: crypto.randomUUID(),
    updatedAt: Date.now(),
    title: 'Untitled',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDraftPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty items initially', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    expect(result.current.items).toEqual([])
  })

  it('creates an item and reflects it in items', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    const item = makeItem({ title: 'My Draft' })

    act(() => {
      result.current.createItem(item)
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].title).toBe('My Draft')
  })

  it('getItem returns the correct item', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    const item = makeItem({ title: 'Find Me' })

    act(() => {
      result.current.createItem(item)
    })

    expect(result.current.getItem(item.id)?.title).toBe('Find Me')
    expect(result.current.getItem('nonexistent')).toBeUndefined()
  })

  it('updates an item', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    const item = makeItem({ title: 'Original' })

    act(() => {
      result.current.createItem(item)
    })

    act(() => {
      result.current.updateItem(item.id, { title: 'Updated' })
    })

    expect(result.current.items[0].title).toBe('Updated')
  })

  it('deletes an item', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    const item = makeItem()

    act(() => {
      result.current.createItem(item)
    })
    expect(result.current.items).toHaveLength(1)

    act(() => {
      result.current.deleteItem(item.id)
    })
    expect(result.current.items).toHaveLength(0)
  })

  it('respects maxItems limit on create', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
        maxItems: 2,
      })
    )

    act(() => {
      result.current.createItem(makeItem({ title: 'A' }))
    })
    act(() => {
      result.current.createItem(makeItem({ title: 'B' }))
    })

    expect(() => {
      act(() => {
        result.current.createItem(makeItem({ title: 'C' }))
      })
    }).toThrow('Maximum 2 items allowed')

    expect(result.current.items).toHaveLength(2)
  })

  it('refreshItems triggers a re-read from localStorage', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    // Sneak an item directly into localStorage
    const item = makeItem({ title: 'Sneaky' })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: '1', lastModified: Date.now(), items: [item] })
    )

    // Items should still be empty (no version bump yet)
    expect(result.current.items).toHaveLength(0)

    act(() => {
      result.current.refreshItems()
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].title).toBe('Sneaky')
  })

  it('calls isMilestone to detect immediate-sync updates', () => {
    const isMilestone = vi.fn((updates: Partial<TestItem>) => updates.title === 'MILESTONE')

    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
        isMilestone,
      })
    )

    const item = makeItem({ title: 'Start' })

    act(() => {
      result.current.createItem(item)
    })

    // Non-milestone update
    act(() => {
      result.current.updateItem(item.id, { title: 'Normal' })
    })
    expect(isMilestone).toHaveBeenCalledWith({ title: 'Normal' })

    // Milestone update
    act(() => {
      result.current.updateItem(item.id, { title: 'MILESTONE' })
    })
    expect(isMilestone).toHaveBeenCalledWith({ title: 'MILESTONE' })
    expect(isMilestone).toHaveBeenCalledTimes(2)
  })

  it('updateItem on a nonexistent id is a no-op', () => {
    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({
        storageKey: STORAGE_KEY,
        nostrIdentifier: NOSTR_ID,
      })
    )

    // Should not throw
    act(() => {
      result.current.updateItem('does-not-exist', { title: 'Nope' })
    })

    expect(result.current.items).toHaveLength(0)
  })
})

# Upload Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract reusable `useDraftPersistence<T>` and `useFileUpload` hooks from the upload system to eliminate duplication and reduce complexity.

**Architecture:** The draft persistence hook wraps localStorage + NIP-78 sync generically. The file upload hook wraps blossom-upload.ts functions into a React-friendly API. Both are composed by existing upload-specific code, preserving all current APIs.

**Tech Stack:** React 18, TypeScript, Vitest, localStorage, NIP-78 (kind 30078), NIP-44 encryption, blossom-client-sdk

---

### Task 1: Create generic draft-storage utilities

**Files:**

- Create: `src/lib/draft-persistence-storage.ts`
- Reference: `src/lib/draft-storage.ts` (existing upload-specific version)

**Step 1: Write the failing test**

Create `src/lib/draft-persistence-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getItemsFromStorage,
  saveItemsToStorage,
  getStorageLastModified,
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

const STORAGE_KEY = 'test_drafts'
const MAX_ITEMS = 10

beforeEach(() => {
  localStorage.clear()
})

describe('getItemsFromStorage', () => {
  it('returns empty array when no data', () => {
    expect(getItemsFromStorage<TestItem>(STORAGE_KEY)).toEqual([])
  })

  it('returns stored items', () => {
    const items: TestItem[] = [{ id: '1', updatedAt: 1000, name: 'test' }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: '1', lastModified: 1000, items }))
    expect(getItemsFromStorage<TestItem>(STORAGE_KEY)).toEqual(items)
  })
})

describe('saveItemsToStorage', () => {
  it('persists items with lastModified timestamp', () => {
    const items: TestItem[] = [{ id: '1', updatedAt: 1000, name: 'test' }]
    saveItemsToStorage(STORAGE_KEY, items)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.items).toEqual(items)
    expect(stored.lastModified).toBeGreaterThan(0)
    expect(stored.version).toBe('1')
  })
})

describe('addItemToStorage', () => {
  it('adds item to storage', () => {
    const item: TestItem = { id: '1', updatedAt: 1000, name: 'test' }
    addItemToStorage(STORAGE_KEY, item, MAX_ITEMS)
    expect(getItemsFromStorage<TestItem>(STORAGE_KEY)).toEqual([item])
  })

  it('throws when max items reached', () => {
    for (let i = 0; i < MAX_ITEMS; i++) {
      addItemToStorage(STORAGE_KEY, { id: String(i), updatedAt: 1000, name: `test${i}` }, MAX_ITEMS)
    }
    expect(() =>
      addItemToStorage(
        STORAGE_KEY,
        { id: 'overflow', updatedAt: 1000, name: 'overflow' },
        MAX_ITEMS
      )
    ).toThrow(`Maximum ${MAX_ITEMS} items allowed`)
  })
})

describe('updateItemInStorage', () => {
  it('updates existing item', () => {
    addItemToStorage(STORAGE_KEY, { id: '1', updatedAt: 1000, name: 'old' }, MAX_ITEMS)
    const result = updateItemInStorage<TestItem>(STORAGE_KEY, '1', { name: 'new' })
    expect(result?.name).toBe('new')
    expect(result?.updatedAt).toBeGreaterThan(1000)
  })

  it('returns undefined for missing item', () => {
    const result = updateItemInStorage<TestItem>(STORAGE_KEY, 'missing', { name: 'new' })
    expect(result).toBeUndefined()
  })
})

describe('deleteItemFromStorage', () => {
  it('removes item', () => {
    addItemToStorage(STORAGE_KEY, { id: '1', updatedAt: 1000, name: 'test' }, MAX_ITEMS)
    deleteItemFromStorage(STORAGE_KEY, '1')
    expect(getItemsFromStorage<TestItem>(STORAGE_KEY)).toEqual([])
  })
})

describe('mergeItemsFromNostr', () => {
  it('prefers newer Nostr item over local', () => {
    addItemToStorage(STORAGE_KEY, { id: '1', updatedAt: 1000, name: 'local' }, MAX_ITEMS)
    const merged = mergeItemsFromNostr<TestItem>(
      STORAGE_KEY,
      [{ id: '1', updatedAt: 2000, name: 'nostr' }],
      3 // nostr timestamp in seconds (3000ms > local lastModified)
    )
    expect(merged.find(d => d.id === '1')?.name).toBe('nostr')
  })

  it('keeps local item when newer', () => {
    addItemToStorage(STORAGE_KEY, { id: '1', updatedAt: 5000, name: 'local' }, MAX_ITEMS)
    const merged = mergeItemsFromNostr<TestItem>(
      STORAGE_KEY,
      [{ id: '1', updatedAt: 1000, name: 'nostr' }],
      3
    )
    expect(merged.find(d => d.id === '1')?.name).toBe('local')
  })

  it('adds new Nostr items when Nostr event is newer', () => {
    // Set local lastModified to 1000ms by saving items
    saveItemsToStorage(STORAGE_KEY, [])
    // Manually set lastModified to a known value
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    data.lastModified = 1000
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

    const merged = mergeItemsFromNostr<TestItem>(
      STORAGE_KEY,
      [{ id: 'new', updatedAt: 2000, name: 'from-nostr' }],
      2 // 2000ms > 1000ms local
    )
    expect(merged.find(d => d.id === 'new')?.name).toBe('from-nostr')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/draft-persistence-storage.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `src/lib/draft-persistence-storage.ts`:

```typescript
/**
 * Generic Draft Persistence Storage
 *
 * Pure functions for persisting items to localStorage with
 * Nostr merge support. Schema-agnostic — works with any type
 * that has `id: string` and `updatedAt: number`.
 */

interface StorageData<T> {
  version: string
  lastModified: number
  items: T[]
}

type Identifiable = { id: string; updatedAt: number }

export function getItemsFromStorage<T extends Identifiable>(storageKey: string): T[] {
  const stored = localStorage.getItem(storageKey)
  if (stored) {
    try {
      const parsed: StorageData<T> = JSON.parse(stored)
      return parsed.items || []
    } catch (error) {
      console.error(`[draft-persistence] Failed to load from ${storageKey}:`, error)
    }
  }
  return []
}

export function getStorageLastModified(storageKey: string): number {
  const stored = localStorage.getItem(storageKey)
  if (stored) {
    try {
      const parsed: StorageData<unknown> = JSON.parse(stored)
      return parsed.lastModified || 0
    } catch {
      return 0
    }
  }
  return 0
}

export function saveItemsToStorage<T extends Identifiable>(storageKey: string, items: T[]): void {
  const data: StorageData<T> = {
    version: '1',
    lastModified: Date.now(),
    items,
  }
  localStorage.setItem(storageKey, JSON.stringify(data))
}

export function addItemToStorage<T extends Identifiable>(
  storageKey: string,
  item: T,
  maxItems: number
): void {
  const items = getItemsFromStorage<T>(storageKey)
  if (items.length >= maxItems) {
    throw new Error(`Maximum ${maxItems} items allowed`)
  }
  saveItemsToStorage(storageKey, [...items, item])
}

export function updateItemInStorage<T extends Identifiable>(
  storageKey: string,
  id: string,
  updates: Partial<T>
): T | undefined {
  const items = getItemsFromStorage<T>(storageKey)
  const index = items.findIndex(d => d.id === id)
  if (index === -1) return undefined

  const updated = { ...items[index], ...updates, updatedAt: Date.now() }
  items[index] = updated
  saveItemsToStorage(storageKey, items)
  return updated
}

export function deleteItemFromStorage(storageKey: string, id: string): void {
  const items = getItemsFromStorage(storageKey)
  saveItemsToStorage(
    storageKey,
    items.filter(d => d.id !== id)
  )
}

export function mergeItemsFromNostr<T extends Identifiable>(
  storageKey: string,
  nostrItems: T[],
  nostrEventTimestamp: number
): T[] {
  const localItems = getItemsFromStorage<T>(storageKey)
  const localLastModified = getStorageLastModified(storageKey)
  const itemMap = new Map<string, T>()

  localItems.forEach(d => itemMap.set(d.id, d))

  const nostrEventMs = nostrEventTimestamp * 1000
  const shouldRestoreFromNostr = nostrEventMs > localLastModified

  nostrItems.forEach(d => {
    const existing = itemMap.get(d.id)
    if (existing) {
      if (d.updatedAt > existing.updatedAt) {
        itemMap.set(d.id, d)
      }
    } else if (shouldRestoreFromNostr) {
      itemMap.set(d.id, d)
    }
  })

  return Array.from(itemMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/draft-persistence-storage.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/draft-persistence-storage.ts src/lib/draft-persistence-storage.test.ts
git commit -m "feat: add generic draft-persistence-storage utilities"
```

---

### Task 2: Create `useDraftPersistence<T>` hook

**Files:**

- Create: `src/hooks/useDraftPersistence.ts`
- Create: `src/hooks/useDraftPersistence.test.ts`
- Reference: `src/hooks/useUploadDrafts.ts` (source of logic to extract)
- Reference: `src/providers/upload/UploadManagerProvider.tsx:197-406` (duplicate logic)

**Step 1: Write the failing test**

Create `src/hooks/useDraftPersistence.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftPersistence } from './useDraftPersistence'

// Mock dependencies
vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null }),
}))
vi.mock('./useAppContext', () => ({
  useAppContext: () => ({
    config: { relays: [] },
    pool: {},
  }),
}))
vi.mock('./useNostrPublish', () => ({
  useNostrPublish: () => ({ publish: vi.fn() }),
}))

interface TestItem {
  id: string
  updatedAt: number
  name: string
}

const STORAGE_KEY = 'test_persistence'
const NOSTR_ID = 'test-persistence'

beforeEach(() => {
  localStorage.clear()
})

describe('useDraftPersistence', () => {
  const defaultOptions = {
    storageKey: STORAGE_KEY,
    nostrIdentifier: NOSTR_ID,
    maxItems: 10,
  }

  it('returns empty items initially', () => {
    const { result } = renderHook(() => useDraftPersistence<TestItem>(defaultOptions))
    expect(result.current.items).toEqual([])
  })

  it('creates and persists items', () => {
    const { result } = renderHook(() => useDraftPersistence<TestItem>(defaultOptions))

    act(() => {
      result.current.createItem({ id: '1', updatedAt: Date.now(), name: 'test' })
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('test')
  })

  it('updates items', () => {
    const { result } = renderHook(() => useDraftPersistence<TestItem>(defaultOptions))

    act(() => {
      result.current.createItem({ id: '1', updatedAt: Date.now(), name: 'old' })
    })

    act(() => {
      result.current.updateItem('1', { name: 'new' })
    })

    expect(result.current.items[0].name).toBe('new')
  })

  it('deletes items', () => {
    const { result } = renderHook(() => useDraftPersistence<TestItem>(defaultOptions))

    act(() => {
      result.current.createItem({ id: '1', updatedAt: Date.now(), name: 'test' })
    })

    act(() => {
      result.current.deleteItem('1')
    })

    expect(result.current.items).toHaveLength(0)
  })

  it('gets item by id', () => {
    const { result } = renderHook(() => useDraftPersistence<TestItem>(defaultOptions))

    act(() => {
      result.current.createItem({ id: '1', updatedAt: Date.now(), name: 'test' })
    })

    expect(result.current.getItem('1')?.name).toBe('test')
    expect(result.current.getItem('missing')).toBeUndefined()
  })

  it('uses milestone callback for immediate sync', () => {
    const isMilestone = (updates: Partial<TestItem>) => updates.name === 'milestone'

    const { result } = renderHook(() =>
      useDraftPersistence<TestItem>({ ...defaultOptions, isMilestone })
    )

    act(() => {
      result.current.createItem({ id: '1', updatedAt: Date.now(), name: 'test' })
    })

    // Non-milestone update should debounce (no immediate Nostr sync)
    act(() => {
      result.current.updateItem('1', { name: 'regular' })
    })

    // Milestone update would trigger immediate sync (verified via mock in integration)
    act(() => {
      result.current.updateItem('1', { name: 'milestone' })
    })

    expect(result.current.items[0].name).toBe('milestone')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useDraftPersistence.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `src/hooks/useDraftPersistence.ts`. This extracts the generic parts from `useUploadDrafts.ts` and `UploadManagerProvider.tsx`:

```typescript
/**
 * Generic Draft Persistence Hook
 *
 * Manages a list of items persisted to localStorage and optionally
 * synced to Nostr via NIP-78 (kind 30078, encrypted with NIP-44).
 *
 * Schema-agnostic — works with any type that has `id` and `updatedAt`.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { nowInSecs } from '@/lib/utils'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import {
  getItemsFromStorage,
  saveItemsToStorage,
  addItemToStorage,
  updateItemInStorage,
  deleteItemFromStorage,
  mergeItemsFromNostr,
} from '@/lib/draft-persistence-storage'

type Identifiable = { id: string; updatedAt: number }

function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): {
  (...args: Parameters<T>): void
  flush: () => void
} {
  let timeout: NodeJS.Timeout | null = null
  let lastArgs: Parameters<T> | null = null

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      func(...args)
      lastArgs = null
    }, wait)
  }

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    if (lastArgs) {
      func(...lastArgs)
      lastArgs = null
    }
  }

  return debounced
}

export interface DraftPersistenceOptions<T extends Identifiable> {
  storageKey: string
  nostrIdentifier: string
  maxItems?: number
  isMilestone?: (updates: Partial<T>) => boolean
  debounceMs?: number
}

export interface DraftPersistence<T extends Identifiable> {
  items: T[]
  getItem(id: string): T | undefined
  createItem(item: T): void
  updateItem(id: string, updates: Partial<T>): void
  deleteItem(id: string): void
  refreshItems(): void
  flushSync(): Promise<void>
}

export function useDraftPersistence<T extends Identifiable>(
  options: DraftPersistenceOptions<T>
): DraftPersistence<T> {
  const { storageKey, nostrIdentifier, maxItems = 50, isMilestone, debounceMs = 5000 } = options

  const [version, setVersion] = useState(0)

  const items = useMemo(() => {
    return getItemsFromStorage<T>(storageKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, version])

  const { user } = useCurrentUser()
  const { config, pool } = useAppContext()

  const inflightSaveRef = useRef<Promise<void> | null>(null)
  const lastSyncedContentRef = useRef<string | null>(null)

  const bumpVersion = useCallback(() => setVersion(v => v + 1), [])

  // Save to Nostr (NIP-78 encrypted)
  const saveToNostr = useCallback(
    async (itemsToSave: T[]) => {
      if (!user?.signer?.nip44) return

      const saveOperation = async () => {
        try {
          const itemsContent = JSON.stringify(itemsToSave)
          if (itemsContent === lastSyncedContentRef.current) return

          const plaintext = JSON.stringify({
            version: '1',
            lastModified: Date.now(),
            // Use "drafts" key for backwards compatibility with existing NIP-78 events
            drafts: itemsToSave,
          })

          const content = await user.signer.nip44!.encrypt(user.pubkey, plaintext)
          const event = {
            kind: 30078,
            content,
            created_at: nowInSecs(),
            tags: [['d', nostrIdentifier]],
          }

          const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

          const signedEvent = await user.signer.signEvent(event)
          await pool.publish(writeRelays, signedEvent)

          lastSyncedContentRef.current = itemsContent
        } catch (error) {
          console.error(`[useDraftPersistence] Failed to sync to Nostr:`, error)
        } finally {
          inflightSaveRef.current = null
        }
      }

      const promise = saveOperation()
      inflightSaveRef.current = promise
      return promise
    },
    [user, config.relays, pool, nostrIdentifier]
  )

  const saveToNostrRef = useRef(saveToNostr)
  useEffect(() => {
    saveToNostrRef.current = saveToNostr
  }, [saveToNostr])

  const debouncedSaveToNostr = useMemo(
    () =>
      debounce((itemsToSave: T[]) => {
        saveToNostrRef.current(itemsToSave)
      }, debounceMs),
    [debounceMs]
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      debouncedSaveToNostr.flush()
    }
  }, [debouncedSaveToNostr])

  const createItem = useCallback(
    (item: T) => {
      addItemToStorage(storageKey, item, maxItems)
      bumpVersion()
    },
    [storageKey, maxItems, bumpVersion]
  )

  const updateItem = useCallback(
    (id: string, updates: Partial<T>) => {
      const result = updateItemInStorage<T>(storageKey, id, updates)
      if (!result) return

      bumpVersion()

      const freshItems = getItemsFromStorage<T>(storageKey)
      if (isMilestone?.(updates)) {
        saveToNostr(freshItems)
      } else {
        debouncedSaveToNostr(freshItems)
      }
    },
    [storageKey, bumpVersion, isMilestone, saveToNostr, debouncedSaveToNostr]
  )

  const deleteItem = useCallback(
    (id: string) => {
      deleteItemFromStorage(storageKey, id)
      bumpVersion()
      const freshItems = getItemsFromStorage<T>(storageKey)
      saveToNostr(freshItems)
    },
    [storageKey, bumpVersion, saveToNostr]
  )

  const getItem = useCallback(
    (id: string): T | undefined => {
      return getItemsFromStorage<T>(storageKey).find(d => d.id === id)
    },
    [storageKey]
  )

  const refreshItems = useCallback(() => {
    bumpVersion()
  }, [bumpVersion])

  const flushSync = useCallback(async () => {
    debouncedSaveToNostr.flush()
    if (inflightSaveRef.current) {
      await inflightSaveRef.current
    }
  }, [debouncedSaveToNostr])

  // Subscribe to NIP-78 event changes
  useEffect(() => {
    if (!user?.pubkey || !user.signer?.nip44) return

    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)

    const loader = createAddressLoader(pool)
    const sub = loader({
      kind: 30078,
      pubkey: user.pubkey,
      identifier: nostrIdentifier,
      relays: readRelays,
    }).subscribe(async event => {
      if (event) {
        try {
          let plaintext = event.content
          if (user.signer.nip44) {
            try {
              plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content)
            } catch {
              // Legacy unencrypted data
            }
          }

          const parsed = JSON.parse(plaintext)
          // Support both "items" and "drafts" keys for backwards compat
          const nostrItems: T[] = parsed.items || parsed.drafts || []
          const merged = mergeItemsFromNostr<T>(storageKey, nostrItems, event.created_at)
          saveItemsToStorage(storageKey, merged)
          lastSyncedContentRef.current = JSON.stringify(merged)
          bumpVersion()
        } catch (error) {
          console.error(`[useDraftPersistence] Failed to parse NIP-78 event:`, error)
        }
      }
    })

    return () => sub.unsubscribe()
  }, [user?.pubkey, user?.signer, pool, config.relays, nostrIdentifier, storageKey, bumpVersion])

  return {
    items,
    getItem,
    createItem,
    updateItem,
    deleteItem,
    refreshItems,
    flushSync,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useDraftPersistence.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/hooks/useDraftPersistence.ts src/hooks/useDraftPersistence.test.ts
git commit -m "feat: add generic useDraftPersistence hook"
```

---

### Task 3: Migrate `useUploadDrafts` to use `useDraftPersistence`

**Files:**

- Modify: `src/hooks/useUploadDrafts.ts`
- Reference: `src/hooks/useDraftPersistence.ts`

**Step 1: Rewrite `useUploadDrafts` as thin wrapper**

Replace the contents of `src/hooks/useUploadDrafts.ts` with:

```typescript
import { useState, useCallback } from 'react'
import { useDraftPersistence } from './useDraftPersistence'
import type { UploadDraft } from '@/types/upload-draft'
import { removeOldDrafts } from '@/lib/upload-draft-utils'
import { getItemsFromStorage, saveItemsToStorage } from '@/lib/draft-persistence-storage'

const STORAGE_KEY = 'nostube_upload_drafts'
const MAX_DRAFTS = 10

function isMilestoneUpdate(updates: Partial<UploadDraft>): boolean {
  return !!(
    updates.uploadInfo?.videos ||
    updates.thumbnailUploadInfo?.uploadedBlobs ||
    updates.thumbnailUploadInfo?.mirroredBlobs ||
    'dvmTranscodeState' in updates
  )
}

export function useUploadDrafts() {
  const [currentDraft, setCurrentDraft] = useState<UploadDraft | null>(null)

  const persistence = useDraftPersistence<UploadDraft>({
    storageKey: STORAGE_KEY,
    nostrIdentifier: 'nostube-uploads',
    maxItems: MAX_DRAFTS,
    isMilestone: isMilestoneUpdate,
  })

  // Clean old drafts on read
  const drafts = (() => {
    const cleaned = removeOldDrafts(persistence.items, 30)
    if (cleaned.length !== persistence.items.length) {
      saveItemsToStorage(STORAGE_KEY, cleaned)
    }
    return cleaned
  })()

  const createDraftInMemory = useCallback((): UploadDraft => {
    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      people: [],
      contentWarning: { enabled: false, reason: '' },
      expiration: 'none',
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      subtitles: [],
      thumbnailSource: 'generated',
    }
  }, [])

  const persistDraft = useCallback(
    (draft: UploadDraft): void => {
      const existing = persistence.getItem(draft.id)
      if (existing) return // Already persisted
      persistence.createItem({ ...draft, updatedAt: Date.now() })
    },
    [persistence]
  )

  const createDraft = useCallback((): UploadDraft => {
    const newDraft = createDraftInMemory()
    persistDraft(newDraft)
    return newDraft
  }, [createDraftInMemory, persistDraft])

  const updateDraft = useCallback(
    (draftId: string, updates: Partial<UploadDraft>) => {
      persistence.updateItem(draftId, updates)
    },
    [persistence]
  )

  const deleteDraft = useCallback(
    (draftId: string) => {
      persistence.deleteItem(draftId)
    },
    [persistence]
  )

  return {
    drafts,
    currentDraft,
    setCurrentDraft,
    createDraft,
    createDraftInMemory,
    persistDraft,
    updateDraft,
    deleteDraft,
    refreshDrafts: persistence.refreshItems,
    flushNostrSync: persistence.flushSync,
    isLoading: false,
  }
}
```

**Step 2: Run existing tests + build to verify no regressions**

Run: `npx vitest run && npm run typecheck`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/hooks/useUploadDrafts.ts
git commit -m "refactor: migrate useUploadDrafts to useDraftPersistence"
```

---

### Task 4: Migrate `UploadManagerProvider` draft logic to `useDraftPersistence`

**Files:**

- Modify: `src/providers/upload/UploadManagerProvider.tsx`
- Reference: `src/hooks/useDraftPersistence.ts`

This is the most delicate task. The UploadManagerProvider has draft logic (lines 197-406) interleaved with DVM/task logic. We need to replace the draft section while keeping the DVM code's direct storage access for transcode completion (it calls `updateDraftInStorage` and `getDraftFromStorage` directly).

**Step 1: Replace draft management section**

In `UploadManagerProvider.tsx`:

1. Remove duplicate imports: `debounce` from `./utils`, NIP-78 sync code
2. Add `import { useDraftPersistence } from '@/hooks/useDraftPersistence'`
3. Replace the `// ========== DRAFT MANAGEMENT ==========` section (lines 197-406) with:

```typescript
// ========== DRAFT MANAGEMENT ==========

const draftPersistence = useDraftPersistence<UploadDraft>({
  storageKey: 'nostube_upload_drafts',
  nostrIdentifier: 'nostube-uploads',
  maxItems: MAX_DRAFTS,
  isMilestone: isMilestoneUpdate,
})

const drafts = draftPersistence.items
const refreshDrafts = draftPersistence.refreshItems
const flushNostrSync = draftPersistence.flushSync

const createDraftFn = useCallback((): UploadDraft => {
  const newDraft = createEmptyDraft()
  draftPersistence.createItem(newDraft)
  return newDraft
}, [draftPersistence])

const updateDraftFn = useCallback(
  (id: string, updates: Partial<UploadDraft>) => {
    draftPersistence.updateItem(id, updates)
  },
  [draftPersistence]
)

const deleteDraftFn = useCallback(
  (id: string) => {
    draftPersistence.deleteItem(id)
  },
  [draftPersistence]
)

const getDraftFn = useCallback(
  (id: string): UploadDraft | undefined => {
    return draftPersistence.getItem(id)
  },
  [draftPersistence]
)
```

4. Remove: `saveToNostr`, `saveToNostrRef`, `debouncedSaveToNostr`, `inflightSaveRef`, `lastSyncedContentRef`, `draftsVersion`, and the NIP-78 subscription `useEffect`.

5. For the DVM transcode completion code that calls `updateDraftInStorage` / `getDraftFromStorage` / `saveToNostr` directly (in `startTranscode` and `resumeTranscode`), replace those with:
   - `getDraftFromStorage(taskId)` → `draftPersistence.getItem(taskId)`
   - `updateDraftInStorage(taskId, updates)` + `setDraftsVersion` + `saveToNostr` → `draftPersistence.updateItem(taskId, updates)`

**Step 2: Run typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/providers/upload/UploadManagerProvider.tsx
git commit -m "refactor: migrate UploadManagerProvider drafts to useDraftPersistence"
```

---

### Task 5: Create `useFileUpload` hook

**Files:**

- Create: `src/hooks/useFileUpload.ts`
- Create: `src/hooks/useFileUpload.test.ts`
- Reference: `src/lib/blossom-upload.ts` (low-level functions)
- Reference: `src/hooks/useVideoUpload.ts:362-393,423-527,704-757` (duplicated patterns)

**Step 1: Write the failing test**

Create `src/hooks/useFileUpload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileUpload } from './useFileUpload'

// Mock blossom-upload
vi.mock('@/lib/blossom-upload', () => ({
  uploadFileToMultipleServersChunked: vi.fn(),
  mirrorBlobsToServers: vi.fn(),
  deleteBlobsFromServers: vi.fn(),
}))

import {
  uploadFileToMultipleServersChunked,
  mirrorBlobsToServers,
  deleteBlobsFromServers,
} from '@/lib/blossom-upload'

const mockUpload = vi.mocked(uploadFileToMultipleServersChunked)
const mockMirror = vi.mocked(mirrorBlobsToServers)
const mockDelete = vi.mocked(deleteBlobsFromServers)

const mockSigner = vi.fn()
const mockBlob = {
  url: 'https://cdn.example.com/abc123',
  sha256: 'abc123',
  size: 1000,
  type: 'video/mp4',
  uploaded: Date.now(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFileUpload', () => {
  const defaultOptions = {
    initialServers: ['https://cdn1.example.com'],
    mirrorServers: ['https://cdn2.example.com'],
    signer: mockSigner,
  }

  it('starts in idle state', () => {
    const { result } = renderHook(() => useFileUpload(defaultOptions))
    expect(result.current.uploading).toBe(false)
    expect(result.current.progress).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('uploads a file and mirrors', async () => {
    mockUpload.mockResolvedValue([mockBlob])
    mockMirror.mockResolvedValue([{ ...mockBlob, url: 'https://cdn2.example.com/abc123' }])

    const { result } = renderHook(() => useFileUpload(defaultOptions))

    let uploadResult: Awaited<ReturnType<typeof result.current.upload>>
    await act(async () => {
      uploadResult = await result.current.upload(new File(['test'], 'video.mp4'))
    })

    expect(uploadResult!.uploadedBlobs).toHaveLength(1)
    expect(uploadResult!.mirroredBlobs).toHaveLength(1)
    expect(mockUpload).toHaveBeenCalledOnce()
    expect(mockMirror).toHaveBeenCalledOnce()
  })

  it('handles upload errors', async () => {
    mockUpload.mockRejectedValue(new Error('Upload failed'))

    const { result } = renderHook(() => useFileUpload(defaultOptions))

    await act(async () => {
      try {
        await result.current.upload(new File(['test'], 'video.mp4'))
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBe('Upload failed')
    expect(result.current.uploading).toBe(false)
  })

  it('skips mirror when no mirror servers', async () => {
    mockUpload.mockResolvedValue([mockBlob])

    const { result } = renderHook(() => useFileUpload({ ...defaultOptions, mirrorServers: [] }))

    let uploadResult: Awaited<ReturnType<typeof result.current.upload>>
    await act(async () => {
      uploadResult = await result.current.upload(new File(['test'], 'video.mp4'))
    })

    expect(uploadResult!.mirroredBlobs).toEqual([])
    expect(mockMirror).not.toHaveBeenCalled()
  })

  it('deletes blobs', async () => {
    mockDelete.mockResolvedValue({ totalSuccessful: 2, totalFailed: 0 })

    const { result } = renderHook(() => useFileUpload(defaultOptions))

    await act(async () => {
      await result.current.deleteBlobs([mockBlob])
    })

    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('resets state', async () => {
    mockUpload.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useFileUpload(defaultOptions))

    await act(async () => {
      try {
        await result.current.upload(new File([''], 'f.mp4'))
      } catch {}
    })
    expect(result.current.error).toBe('fail')

    act(() => {
      result.current.reset()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.uploading).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useFileUpload.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `src/hooks/useFileUpload.ts`:

```typescript
/**
 * Generic File Upload Hook
 *
 * React wrapper around blossom-upload.ts functions.
 * Handles upload → mirror pipeline with progress tracking.
 * Used for videos, thumbnails, subtitles, or any file type.
 */

import { useState, useCallback } from 'react'
import type { BlobDescriptor } from 'blossom-client-sdk'
import {
  uploadFileToMultipleServersChunked,
  mirrorBlobsToServers,
  deleteBlobsFromServers,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import type { EventTemplate } from 'nostr-tools'

export interface FileUploadOptions {
  initialServers: string[]
  mirrorServers?: string[]
  signer: (draft: EventTemplate) => Promise<EventTemplate>
  chunkSize?: number
  maxConcurrentChunks?: number
}

export interface FileUploadResult {
  uploadedBlobs: BlobDescriptor[]
  mirroredBlobs: BlobDescriptor[]
}

export interface UseFileUploadReturn {
  upload: (file: File) => Promise<FileUploadResult>
  deleteBlobs: (blobs: BlobDescriptor[]) => Promise<void>
  progress: ChunkedUploadProgress | null
  uploading: boolean
  error: string | null
  reset: () => void
}

export function useFileUpload(options: FileUploadOptions): UseFileUploadReturn {
  const {
    initialServers,
    mirrorServers = [],
    signer,
    chunkSize = 10 * 1024 * 1024,
    maxConcurrentChunks = 2,
  } = options

  const [progress, setProgress] = useState<ChunkedUploadProgress | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File): Promise<FileUploadResult> => {
      setError(null)
      setUploading(true)
      setProgress({
        uploadedBytes: 0,
        totalBytes: file.size,
        percentage: 0,
        currentChunk: 0,
        totalChunks: 1,
      })

      try {
        const uploadedBlobs = await uploadFileToMultipleServersChunked({
          file,
          servers: initialServers,
          signer,
          options: { chunkSize, maxConcurrentChunks },
          callbacks: { onProgress: setProgress },
        })

        let mirroredBlobs: BlobDescriptor[] = []
        if (mirrorServers.length > 0 && uploadedBlobs[0]) {
          mirroredBlobs = await mirrorBlobsToServers({
            mirrorServers,
            blob: uploadedBlobs[0],
            signer,
          })
        }

        setUploading(false)
        setProgress(null)
        return { uploadedBlobs, mirroredBlobs }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown upload error'
        setError(message)
        setUploading(false)
        setProgress(null)
        throw err
      }
    },
    [initialServers, mirrorServers, signer, chunkSize, maxConcurrentChunks]
  )

  const deleteBlobs = useCallback(
    async (blobs: BlobDescriptor[]) => {
      if (blobs.length > 0) {
        await deleteBlobsFromServers(blobs, signer)
      }
    },
    [signer]
  )

  const reset = useCallback(() => {
    setProgress(null)
    setUploading(false)
    setError(null)
  }, [])

  return { upload, deleteBlobs, progress, uploading, error, reset }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useFileUpload.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/hooks/useFileUpload.ts src/hooks/useFileUpload.test.ts
git commit -m "feat: add generic useFileUpload hook"
```

---

### Task 6: Refactor `useVideoUpload` to use `useFileUpload`

**Files:**

- Modify: `src/hooks/useVideoUpload.ts`
- Reference: `src/hooks/useFileUpload.ts`

This is the largest change. Replace the inlined upload/mirror/delete calls for thumbnails and subtitles with `useFileUpload` instances. Keep video upload using `useFileUpload` too.

**Step 1: Refactor thumbnail upload**

Replace `handleThumbnailDrop` (lines 362-393) — currently calls `uploadFileToMultipleServersChunked` + `mirrorBlobsToServers` inline — with:

```typescript
// At hook level:
const thumbnailFileUpload = useFileUpload({
  initialServers: blossomInitalUploadServers?.map(s => s.url) || [],
  mirrorServers: blossomMirrorServers?.map(s => s.url) || [],
  signer: user ? async draft => await user.signer.signEvent(draft) : async d => d,
})

// Replace handleThumbnailDrop:
const handleThumbnailDrop = async (acceptedFiles: File[]) => {
  if (!acceptedFiles[0] || !blossomInitalUploadServers || !user) return
  setThumbnailUploadInfo({ uploadedBlobs: [], mirroredBlobs: [], uploading: true })
  try {
    const result = await thumbnailFileUpload.upload(acceptedFiles[0])
    setThumbnailUploadInfo({
      uploadedBlobs: result.uploadedBlobs,
      mirroredBlobs: result.mirroredBlobs,
      uploading: false,
    })
    setThumbnail(acceptedFiles[0])
    const blurhash = await generateBlurhash(acceptedFiles[0])
    setThumbnailBlurhash(blurhash)
  } catch {
    setThumbnailUploadInfo({
      uploadedBlobs: [],
      mirroredBlobs: [],
      uploading: false,
      error: 'Failed to upload thumbnail.',
    })
  }
}
```

**Step 2: Refactor subtitle upload**

Replace `handleSubtitleDrop` (lines 704-757) similarly:

```typescript
const subtitleFileUpload = useFileUpload({
  initialServers: blossomInitalUploadServers?.map(s => s.url) || [],
  mirrorServers: blossomMirrorServers?.map(s => s.url) || [],
  signer: user ? async draft => await user.signer.signEvent(draft) : async d => d,
})
```

Then replace the inline `uploadFileToMultipleServersChunked` + `mirrorBlobsToServers` calls inside the for loop with `subtitleFileUpload.upload(file)`.

**Step 3: Refactor video upload (`onDrop` and `handleAddVideo`)**

Replace `onDrop` (lines 423-527) and `handleAddVideo` (lines 561-626) to use a `videoFileUpload` instance. Keep the video-specific post-processing (`processUploadedVideo`) as a separate step after `upload()`.

**Step 4: Refactor `handleDeleteThumbnail`**

Replace direct `deleteBlobsFromServers` call with `thumbnailFileUpload.deleteBlobs(allBlobs)`.

**Step 5: Refactor `handleSubmit` thumbnail fallback**

Replace the inline thumbnail upload in `handleSubmit` (lines 802-827) with `thumbnailFileUpload.upload(thumbnailFile)`.

**Step 6: Remove direct imports**

Remove unused imports of `uploadFileToMultipleServersChunked`, `mirrorBlobsToServers`, `deleteBlobsFromServers` from `useVideoUpload.ts`.

**Step 7: Run typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/hooks/useVideoUpload.ts
git commit -m "refactor: use useFileUpload in useVideoUpload for thumbnails, subtitles, and video"
```

---

### Task 7: Remove `useVideoFileUpload` and update `ReplaceVideoFlow`

**Files:**

- Delete: `src/hooks/useVideoFileUpload.ts`
- Modify: `src/components/edit-video/ReplaceVideoFlow.tsx`

**Step 1: Update `ReplaceVideoFlow` to use `useFileUpload`**

Replace `useVideoFileUpload` import and usage with `useFileUpload` + `processUploadedVideo`/`processVideoUrl` for the video-specific processing.

**Step 2: Delete `useVideoFileUpload.ts`**

Remove the file — it's fully superseded by `useFileUpload`.

**Step 3: Update any barrel exports (hooks/index.ts)**

Check `src/hooks/index.ts` for `useVideoFileUpload` export and remove it. Add `useFileUpload` and `useDraftPersistence` exports.

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: replace useVideoFileUpload with useFileUpload in ReplaceVideoFlow"
```

---

### Task 8: Clean up old draft-storage.ts

**Files:**

- Modify: `src/lib/draft-storage.ts`
- Reference: `src/lib/draft-persistence-storage.ts`

**Step 1: Slim down `draft-storage.ts`**

`draft-storage.ts` still needs to exist for upload-specific helpers (`createEmptyDraft`, `isMilestoneUpdate`) that are used by `UploadManagerProvider` DVM code. But the generic storage functions should delegate to `draft-persistence-storage.ts`.

Replace the generic functions (`getDraftsFromStorage`, `saveDraftsToStorage`, `getLocalStorageLastModified`, `addDraftToStorage`, `updateDraftInStorage`, `deleteDraftFromStorage`, `mergeDraftsFromNostr`) with re-exports from `draft-persistence-storage.ts`:

```typescript
import {
  getItemsFromStorage,
  saveItemsToStorage,
  addItemToStorage,
  updateItemInStorage,
  deleteItemFromStorage,
  mergeItemsFromNostr,
} from './draft-persistence-storage'
import type { UploadDraft } from '@/types/upload-draft'

const STORAGE_KEY = 'nostube_upload_drafts'
export const MAX_DRAFTS = 10

// Re-export with upload-specific defaults
export const getDraftsFromStorage = () => getItemsFromStorage<UploadDraft>(STORAGE_KEY)
export const saveDraftsToStorage = (drafts: UploadDraft[]) =>
  saveItemsToStorage(STORAGE_KEY, drafts)
export const getDraftFromStorage = (id: string) => getDraftsFromStorage().find(d => d.id === id)
export const addDraftToStorage = (draft: UploadDraft) =>
  addItemToStorage(STORAGE_KEY, draft, MAX_DRAFTS)
export const updateDraftInStorage = (id: string, updates: Partial<UploadDraft>) =>
  updateItemInStorage<UploadDraft>(STORAGE_KEY, id, updates)
export const deleteDraftFromStorage = (id: string) => deleteItemFromStorage(STORAGE_KEY, id)
export const mergeDraftsFromNostr = (nostrDrafts: UploadDraft[], ts: number) =>
  mergeItemsFromNostr<UploadDraft>(STORAGE_KEY, nostrDrafts, ts)

// Upload-specific helpers (stay here)
export { createEmptyDraft } from './draft-storage-upload'
export { isMilestoneUpdate } from './draft-storage-upload'
```

Actually, simpler approach: keep `createEmptyDraft` and `isMilestoneUpdate` in `draft-storage.ts`, delegate the rest. No need for a separate file.

**Step 2: Run full test suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/lib/draft-storage.ts
git commit -m "refactor: delegate generic storage functions to draft-persistence-storage"
```

---

### Task 9: Final verification and cleanup

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Run full test suite**

Run: `npm run test`
Expected: ALL PASS (typecheck + lint + vitest + build)

**Step 2: Run format**

Run: `npm run format`

**Step 3: Verify no unused imports/exports**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Update CHANGELOG.md**

Add under `[Unreleased]`:

```markdown
### Changed

- Extracted generic `useDraftPersistence<T>` hook from upload draft logic (localStorage + NIP-78 sync + conflict resolution)
- Extracted generic `useFileUpload` hook from blossom upload pipeline (upload → mirror → delete)
- Refactored `useVideoUpload` to compose `useFileUpload` instances instead of inlining blossom calls
- Replaced `useVideoFileUpload` with `useFileUpload` + video-specific processing
- Simplified `UploadManagerProvider` draft management via `useDraftPersistence`
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: update changelog for upload refactor"
```

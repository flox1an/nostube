/**
 * Generic Draft Persistence Storage
 *
 * Pure localStorage CRUD + Nostr merge functions for any item type
 * that satisfies { id: string; updatedAt: number }.
 */

type Identifiable = { id: string; updatedAt: number }

interface StorageData<T> {
  version: string
  lastModified: number
  items: T[]
}

/**
 * Get all items from localStorage for a given key.
 */
export function getItemsFromStorage<T extends Identifiable>(storageKey: string): T[] {
  const stored = localStorage.getItem(storageKey)
  if (stored) {
    try {
      const parsed: StorageData<T> = JSON.parse(stored)
      return parsed.items ?? []
    } catch (error) {
      console.error(`[draft-persistence-storage] Failed to load items from ${storageKey}:`, error)
    }
  }
  return []
}

/**
 * Get the lastModified timestamp from localStorage.
 */
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

/**
 * Save items to localStorage with version and lastModified wrapper.
 */
export function saveItemsToStorage<T extends Identifiable>(storageKey: string, items: T[]): void {
  const data: StorageData<T> = {
    version: '1',
    lastModified: Date.now(),
    items,
  }
  localStorage.setItem(storageKey, JSON.stringify(data))
}

/**
 * Add a single item to storage. Throws if maxItems is reached.
 */
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

/**
 * Update an item in storage by id. Sets updatedAt to Date.now().
 * Returns the updated item, or undefined if not found.
 */
export function updateItemInStorage<T extends Identifiable>(
  storageKey: string,
  id: string,
  updates: Partial<T>
): T | undefined {
  const items = getItemsFromStorage<T>(storageKey)
  const index = items.findIndex(item => item.id === id)

  if (index === -1) {
    return undefined
  }

  const updatedItem = {
    ...items[index],
    ...updates,
    updatedAt: Date.now(),
  }
  items[index] = updatedItem
  saveItemsToStorage(storageKey, items)

  return updatedItem
}

/**
 * Delete an item from storage by id.
 */
export function deleteItemFromStorage(storageKey: string, id: string): void {
  const items = getItemsFromStorage(storageKey)
  const filtered = items.filter(item => item.id !== id)
  saveItemsToStorage(storageKey, filtered)
}

/**
 * Merge items from Nostr with local items using timestamp-based conflict resolution.
 *
 * - For items that exist in both: Nostr wins if its updatedAt is newer.
 * - For items only in Nostr: added only if nostrEventTimestamp > local lastModified.
 * - Returns merged items sorted by updatedAt descending.
 */
export function mergeItemsFromNostr<T extends Identifiable>(
  storageKey: string,
  nostrItems: T[],
  nostrEventTimestamp: number
): T[] {
  const localItems = getItemsFromStorage<T>(storageKey)
  const localLastModified = getStorageLastModified(storageKey)
  const itemMap = new Map<string, T>()

  // Add local items first
  localItems.forEach(item => itemMap.set(item.id, item))

  // Nostr event timestamp is in seconds; local lastModified is in ms
  const nostrEventMs = nostrEventTimestamp * 1000
  const shouldRestoreFromNostr = nostrEventMs > localLastModified

  nostrItems.forEach(item => {
    const existing = itemMap.get(item.id)
    if (existing) {
      // Item exists locally — update if Nostr version is newer
      if (item.updatedAt > existing.updatedAt) {
        itemMap.set(item.id, item)
      }
    } else if (shouldRestoreFromNostr) {
      // Item doesn't exist locally — only add if Nostr event is newer
      itemMap.set(item.id, item)
    }
  })

  // Sort by updatedAt descending
  return Array.from(itemMap.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

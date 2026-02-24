import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getItemsFromStorage,
  saveItemsToStorage,
  addItemToStorage,
  updateItemInStorage,
  deleteItemFromStorage,
  mergeItemsFromNostr,
} from '@/lib/draft-persistence-storage'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { nowInSecs } from '@/lib/utils'
import { createAddressLoader } from 'applesauce-loaders/loaders'

// ---------------------------------------------------------------------------
// Debounce utility
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftPersistenceOptions<T extends { id: string; updatedAt: number }> {
  storageKey: string
  nostrIdentifier: string // NIP-78 'd' tag value
  maxItems?: number // default 50
  isMilestone?: (updates: Partial<T>) => boolean // triggers immediate sync
  debounceMs?: number // default 5000
}

export interface DraftPersistence<T extends { id: string; updatedAt: number }> {
  items: T[]
  getItem(id: string): T | undefined
  createItem(item: T): void
  updateItem(id: string, updates: Partial<T>): void
  deleteItem(id: string): void
  refreshItems(): void
  flushSync(): Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDraftPersistence<T extends { id: string; updatedAt: number }>(
  options: DraftPersistenceOptions<T>
): DraftPersistence<T> {
  const { storageKey, nostrIdentifier, maxItems = 50, isMilestone, debounceMs = 5000 } = options

  // Version counter drives useMemo re-computation of items from localStorage
  const [version, setVersion] = useState(0)

  const items = useMemo(() => {
    const fresh = getItemsFromStorage<T>(storageKey)
    if (import.meta.env.DEV) {
      console.log(`[useDraftPersistence:${storageKey}] items recomputed, version=${version}`, fresh)
    }
    return fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, version])

  const { user } = useCurrentUser()
  const { config, pool } = useAppContext()

  // Track in-flight Nostr saves so flushSync can await them
  const inflightSaveRef = useRef<Promise<void> | null>(null)

  // Track last synced content to skip redundant publishes
  const lastSyncedContentRef = useRef<string>('')

  // Bump version helper (triggers items recompute)
  const bumpVersion = useCallback(() => setVersion(v => v + 1), [])

  // ------------------------------------------------------------------
  // saveToNostr
  // ------------------------------------------------------------------

  const saveToNostr = useCallback(
    async (itemsToSave: T[]) => {
      if (!user?.signer?.nip44) return

      // Skip if content hasn't changed since last sync
      const contentJson = JSON.stringify(itemsToSave)
      if (contentJson === lastSyncedContentRef.current) {
        if (import.meta.env.DEV) {
          console.log(`[useDraftPersistence:${storageKey}] saveToNostr skipped (content unchanged)`)
        }
        return
      }

      const saveOperation = async () => {
        try {
          const plaintext = JSON.stringify({
            version: '1',
            lastModified: Date.now(),
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

          // Update last synced content on success
          lastSyncedContentRef.current = contentJson

          if (import.meta.env.DEV) {
            console.log(
              `[useDraftPersistence:${storageKey}] saveToNostr published to ${writeRelays.length} relays`
            )
          }
        } catch (error) {
          console.error(`[useDraftPersistence:${storageKey}] Failed to sync to Nostr:`, error)
        } finally {
          inflightSaveRef.current = null
        }
      }

      const promise = saveOperation()
      inflightSaveRef.current = promise
      return promise
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, config.relays, pool, storageKey, nostrIdentifier]
  )

  // Keep a stable ref so the debounced callback always calls the latest version
  const saveToNostrRef = useRef(saveToNostr)
  useEffect(() => {
    saveToNostrRef.current = saveToNostr
  }, [saveToNostr])

  // Create debounced save once (stable across renders)
  const debouncedSaveToNostr = useMemo(
    () =>
      debounce((itemsToSave: T[]) => {
        saveToNostrRef.current(itemsToSave)
      }, debounceMs),
    [debounceMs]
  )

  // Flush pending debounced save on unmount
  useEffect(() => {
    return () => {
      debouncedSaveToNostr.flush()
    }
  }, [debouncedSaveToNostr])

  // ------------------------------------------------------------------
  // CRUD operations
  // ------------------------------------------------------------------

  const getItem = useCallback(
    (id: string): T | undefined => {
      return getItemsFromStorage<T>(storageKey).find(item => item.id === id)
    },
    [storageKey]
  )

  const createItem = useCallback(
    (item: T): void => {
      addItemToStorage<T>(storageKey, item, maxItems)
      bumpVersion()
    },
    [storageKey, maxItems, bumpVersion]
  )

  const updateItem = useCallback(
    (id: string, updates: Partial<T>): void => {
      const result = updateItemInStorage<T>(storageKey, id, updates)
      if (!result) return // item not found

      bumpVersion()

      // Read fresh items for Nostr sync
      const fresh = getItemsFromStorage<T>(storageKey)

      if (isMilestone?.(updates)) {
        saveToNostrRef.current(fresh)
      } else {
        debouncedSaveToNostr(fresh)
      }
    },
    [storageKey, isMilestone, debouncedSaveToNostr, bumpVersion]
  )

  const deleteItem = useCallback(
    (id: string): void => {
      deleteItemFromStorage(storageKey, id)
      bumpVersion()

      // Always immediate Nostr sync on delete
      const fresh = getItemsFromStorage<T>(storageKey)
      saveToNostrRef.current(fresh)
    },
    [storageKey, bumpVersion]
  )

  const refreshItems = useCallback(() => {
    bumpVersion()
  }, [bumpVersion])

  // ------------------------------------------------------------------
  // NIP-78 subscription (sync from Nostr)
  // ------------------------------------------------------------------

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
      if (!event) return
      try {
        let plaintext = event.content
        if (user.signer.nip44) {
          try {
            plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content)
          } catch {
            // Legacy unencrypted event — use raw content
          }
        }

        const parsed = JSON.parse(plaintext)
        // Backwards compat: accept "drafts" or "items"
        const nostrItems: T[] = parsed.drafts || parsed.items || []

        const merged = mergeItemsFromNostr<T>(storageKey, nostrItems, event.created_at)

        // Only save if the merge produced different content
        const localItems = getItemsFromStorage<T>(storageKey)
        if (JSON.stringify(merged) !== JSON.stringify(localItems)) {
          saveItemsToStorage(storageKey, merged)
          bumpVersion()

          if (import.meta.env.DEV) {
            console.log(
              `[useDraftPersistence:${storageKey}] merged ${nostrItems.length} Nostr items`
            )
          }
        }
      } catch (error) {
        console.error(`[useDraftPersistence:${storageKey}] Failed to parse NIP-78 event:`, error)
      }
    })

    return () => sub.unsubscribe()
  }, [user?.pubkey, user?.signer, pool, config.relays, storageKey, nostrIdentifier, bumpVersion])

  // ------------------------------------------------------------------
  // flushSync
  // ------------------------------------------------------------------

  const flushSync = useCallback(async () => {
    debouncedSaveToNostr.flush()

    if (inflightSaveRef.current) {
      await inflightSaveRef.current
    }
  }, [debouncedSaveToNostr])

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

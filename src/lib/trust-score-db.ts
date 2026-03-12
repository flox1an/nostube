/**
 * IndexedDB storage for trust score results.
 *
 * Stores full TrustScoreResult objects with stale-while-revalidate semantics:
 * - Fresh entries (< CACHE_TTL): served from cache, no refetch
 * - Stale entries (>= CACHE_TTL): served from cache AND refetched in background
 * - Missing entries: fetched from network
 *
 * Uses a single object store keyed by target pubkey.
 */
import type { TrustScoreResult } from '@/nostr/contextvm'

const DB_NAME = 'nostube-trust-scores'
const DB_VERSION = 1
const STORE_NAME = 'scores'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

interface StoredEntry {
  pubkey: string
  result: TrustScoreResult
  timestamp: number
}

/** Result of a cache lookup: the result (if any) and whether it's stale. */
export interface CacheEntry {
  result: TrustScoreResult | null
  stale: boolean
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'pubkey' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })

  return dbPromise
}

/** Get a single cached trust score result. Returns the result and whether it's stale. */
export async function getCachedResult(pubkey: string): Promise<TrustScoreResult | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(pubkey)
      request.onsuccess = () => {
        const entry = request.result as StoredEntry | undefined
        if (entry) {
          resolve(entry.result)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

/**
 * Get multiple cached trust score results (stale-while-revalidate).
 * Always returns a cached result if one exists, even if expired.
 * The `stale` set contains pubkeys that need background revalidation.
 */
export async function getCachedResults(
  pubkeys: string[]
): Promise<{ results: Map<string, TrustScoreResult | null>; stale: Set<string> }> {
  const results = new Map<string, TrustScoreResult | null>()
  const stale = new Set<string>()
  if (pubkeys.length === 0) return { results, stale }

  try {
    const db = await openDB()
    const now = Date.now()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      let completed = 0

      for (const pubkey of pubkeys) {
        const request = store.get(pubkey)
        request.onsuccess = () => {
          const entry = request.result as StoredEntry | undefined
          if (entry) {
            // Always return the cached result
            results.set(pubkey, entry.result)
            // Mark as stale if past TTL
            if (now - entry.timestamp >= CACHE_TTL) {
              stale.add(pubkey)
            }
          } else {
            results.set(pubkey, null)
          }
          completed++
          if (completed === pubkeys.length) resolve({ results, stale })
        }
        request.onerror = () => reject(request.error)
      }
    })
  } catch {
    // On error, return all as null
    for (const pk of pubkeys) results.set(pk, null)
    return { results, stale }
  }
}

/** Store one or more trust score results in IndexedDB. */
export async function setCachedResults(results: TrustScoreResult[]): Promise<void> {
  if (results.length === 0) return

  try {
    const db = await openDB()
    const now = Date.now()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      for (const result of results) {
        const entry: StoredEntry = {
          pubkey: result.targetPubkey,
          result,
          timestamp: now,
        }
        store.put(entry)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Silently fail — cache is best-effort
  }
}

/** Remove very old entries (> 7 days) from the store. */
export async function pruneExpired(): Promise<void> {
  const MAX_AGE = CACHE_TTL * 7 // keep stale entries up to 7 days
  try {
    const db = await openDB()
    const now = Date.now()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.openCursor()

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const entry = cursor.value as StoredEntry
          if (now - entry.timestamp >= MAX_AGE) {
            cursor.delete()
          }
          cursor.continue()
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Ignore prune errors
  }
}

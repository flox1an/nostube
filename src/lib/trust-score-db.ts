/**
 * IndexedDB storage for trust score results.
 *
 * Stores full TrustScoreResult objects with a 24-hour TTL.
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

/** Get a single cached trust score result. Returns null if missing or expired. */
export async function getCachedResult(pubkey: string): Promise<TrustScoreResult | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(pubkey)
      request.onsuccess = () => {
        const entry = request.result as StoredEntry | undefined
        if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
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

/** Get multiple cached trust score results. Returns a Map of pubkey → result (null if missing/expired). */
export async function getCachedResults(
  pubkeys: string[]
): Promise<Map<string, TrustScoreResult | null>> {
  const results = new Map<string, TrustScoreResult | null>()
  if (pubkeys.length === 0) return results

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
          if (entry && now - entry.timestamp < CACHE_TTL) {
            results.set(pubkey, entry.result)
          } else {
            results.set(pubkey, null)
          }
          completed++
          if (completed === pubkeys.length) resolve(results)
        }
        request.onerror = () => reject(request.error)
      }
    })
  } catch {
    // On error, return all as null
    for (const pk of pubkeys) results.set(pk, null)
    return results
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

/** Remove expired entries from the store. Call periodically or on app start. */
export async function pruneExpired(): Promise<void> {
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
          if (now - entry.timestamp >= CACHE_TTL) {
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

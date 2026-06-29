/**
 * IndexedDB cache for playlist NSFW-validation results.
 *
 * A playlist's safety verdict is expensive to compute: we have to load every
 * referenced video event from relays and check it for NSFW/blocked authors and
 * `content-warning` tags. To avoid repeating that work on every render of the
 * global playlist list (or any user-profile playlist grid), we persist the
 * verdict against the playlist's stable identity (`kind:pubkey:dtag`) and the
 * concrete event id that was validated. When the playlist owner re-publishes
 * the playlist the event id changes and the cache entry is automatically
 * invalidated on next lookup.
 *
 * Verdict semantics:
 * - `clean`: all referenced videos were resolvable AND none flagged unsafe at
 *   validation time. Re-checked after `TTL_CLEAN_MS` to account for preset
 *   changes or newly added `content-warning` tags on referenced events.
 * - `unsafe`: at least one referenced video was definitively unsafe. Retained
 *   for `TTL_UNSAFE_MS` (longer — `content-warning` tags are not commonly
 *   removed).
 */

const DB_NAME = 'nostube-playlist-validation'
const DB_VERSION = 1
const STORE_NAME = 'validations'

/** Re-validate `clean` entries after this many milliseconds. */
const TTL_CLEAN_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
/** Re-validate `unsafe` entries after this many milliseconds. */
const TTL_UNSAFE_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

export type PlaylistValidationStatus = 'clean' | 'unsafe'

interface StoredEntry {
  /** Playlist replaceable address: `kind:pubkey:dtag`. Primary key. */
  address: string
  /** Concrete event id at the time the verdict was computed. */
  eventId: string
  status: PlaylistValidationStatus
  /** `Date.now()` when persisted. */
  ts: number
}

/**
 * Wrapper around {@link StoredEntry} returned to callers — same shape minus
 * the storage internals.
 */
export interface CachedValidation {
  eventId: string
  status: PlaylistValidationStatus
  ts: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'address' })
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

function isFresh(entry: StoredEntry, now: number): boolean {
  const ttl = entry.status === 'clean' ? TTL_CLEAN_MS : TTL_UNSAFE_MS
  return now - entry.ts < ttl
}

/**
 * Fetch a single cached validation entry for the given playlist address.
 *
 * Returns `null` when no entry exists, the entry is for a different event id,
 * or the entry has expired (past TTL).
 */
export async function getCached(
  address: string,
  eventId: string
): Promise<CachedValidation | null> {
  try {
    const db = await openDB()
    const now = Date.now()
    return await new Promise<CachedValidation | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(address)
      req.onsuccess = () => {
        const entry = req.result as StoredEntry | undefined
        if (!entry || entry.eventId !== eventId || !isFresh(entry, now)) {
          resolve(null)
          return
        }
        resolve({ eventId: entry.eventId, status: entry.status, ts: entry.ts })
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/**
 * Batch-fetch cached validation entries.
 *
 * Returns a `Map` keyed by playlist `address`, populated only with entries
 * whose `eventId` matches the lookup AND that haven't expired. Addresses with
 * no usable entry are simply absent from the map.
 */
export async function getCachedBatch(
  refs: ReadonlyArray<{ address: string; eventId: string }>
): Promise<Map<string, CachedValidation>> {
  const out = new Map<string, CachedValidation>()
  if (refs.length === 0) return out

  try {
    const db = await openDB()
    const now = Date.now()
    return await new Promise<Map<string, CachedValidation>>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      let remaining = refs.length
      if (remaining === 0) {
        resolve(out)
        return
      }
      for (const { address, eventId } of refs) {
        const req = store.get(address)
        req.onsuccess = () => {
          const entry = req.result as StoredEntry | undefined
          if (entry && entry.eventId === eventId && isFresh(entry, now)) {
            out.set(address, { eventId: entry.eventId, status: entry.status, ts: entry.ts })
          }
          if (--remaining === 0) resolve(out)
        }
        req.onerror = () => reject(req.error)
      }
    })
  } catch {
    return out
  }
}

/**
 * Persist one or more validation verdicts. Best-effort — IDB write errors are
 * swallowed so cache failures never break the UI.
 */
export async function setCached(
  entries: ReadonlyArray<{
    address: string
    eventId: string
    status: PlaylistValidationStatus
  }>
): Promise<void> {
  if (entries.length === 0) return
  try {
    const db = await openDB()
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      for (const { address, eventId, status } of entries) {
        const stored: StoredEntry = { address, eventId, status, ts: now }
        store.put(stored)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // best-effort
  }
}

/** Drop every cached validation. Intended for settings / debug flows. */
export async function clearAll(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // best-effort
  }
}

/** Remove entries past the maximum retention window (60 days). */
export async function pruneExpired(): Promise<void> {
  const MAX_AGE = 1000 * 60 * 60 * 24 * 60
  try {
    const db = await openDB()
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const entry = cursor.value as StoredEntry
          if (now - entry.ts >= MAX_AGE) cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // best-effort
  }
}

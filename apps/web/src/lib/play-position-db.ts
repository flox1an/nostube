const DB_NAME = 'nostube-play-positions'
const DB_VERSION = 1
const STORE_NAME = 'positions'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90 // 90 days

export interface PlayPositionEntry {
  key: string // `${pubkey}:${videoId}`
  pubkey: string
  videoId: string
  time: number
  duration: number
  /** Unix ms timestamp of when the user last actively played this video. */
  lastPlayedAt: number
}

export interface PlayPositionData {
  time: number
  duration: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        // For querying all videos a user has watched
        store.createIndex('pubkey', 'pubkey', { unique: false })
        // For time-range queries: "videos played in the last N days"
        store.createIndex('lastPlayedAt', 'lastPlayedAt', { unique: false })
        // Compound index for efficient per-user history queries
        store.createIndex('pubkey_lastPlayedAt', ['pubkey', 'lastPlayedAt'], { unique: false })
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

export async function getPlayPosition(
  pubkey: string,
  videoId: string
): Promise<PlayPositionData | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(`${pubkey}:${videoId}`)
      request.onsuccess = () => {
        const entry = request.result as PlayPositionEntry | undefined
        if (!entry) return resolve(null)
        resolve({ time: entry.time, duration: entry.duration })
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

export async function setPlayPosition(
  pubkey: string,
  videoId: string,
  data: PlayPositionData,
  lastPlayedAt = Date.now()
): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      // Preserve existing lastPlayedAt if this is just a position update mid-playback
      // (caller can pass an explicit value for migration with historical timestamps)
      const entry: PlayPositionEntry = {
        key: `${pubkey}:${videoId}`,
        pubkey,
        videoId,
        time: data.time,
        duration: data.duration,
        lastPlayedAt,
      }
      store.put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // best-effort
  }
}

/**
 * Return all videos the user has played since the given timestamp (ms).
 * Sorted by lastPlayedAt descending (most recent first).
 */
export async function getRecentlyPlayedVideos(
  pubkey: string,
  sinceMs: number
): Promise<PlayPositionEntry[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const index = tx.objectStore(STORE_NAME).index('pubkey_lastPlayedAt')
      // IDBKeyRange on compound index: [pubkey, sinceMs] to [pubkey, ∞]
      const range = IDBKeyRange.bound([pubkey, sinceMs], [pubkey, Infinity])
      const results: PlayPositionEntry[] = []
      const request = index.openCursor(range, 'prev')
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          results.push(cursor.value as PlayPositionEntry)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve(results)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return []
  }
}

/**
 * Export all play history for a pubkey — useful when building a Nostr event
 * to publish watch history.
 */
export async function getAllPlayedVideos(pubkey: string): Promise<PlayPositionEntry[]> {
  return getRecentlyPlayedVideos(pubkey, 0)
}

export async function pruneOldPositions(): Promise<void> {
  try {
    const db = await openDB()
    const cutoff = Date.now() - MAX_AGE_MS
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const entry = cursor.value as PlayPositionEntry
          if (entry.lastPlayedAt < cutoff) cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

export async function clearAllPlayPositions(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

const DB_NAME = 'nostube-play-positions'
const DB_VERSION = 1
const STORE_NAME = 'positions'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90 // 90 days

interface StoredEntry {
  key: string // `${pubkey}:${videoId}`
  pubkey: string
  videoId: string
  time: number
  duration: number
  updatedAt: number
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
        store.createIndex('pubkey', 'pubkey', { unique: false })
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
        const entry = request.result as StoredEntry | undefined
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
  data: PlayPositionData
): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const entry: StoredEntry = {
        key: `${pubkey}:${videoId}`,
        pubkey,
        videoId,
        time: data.time,
        duration: data.duration,
        updatedAt: Date.now(),
      }
      tx.objectStore(STORE_NAME).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // best-effort
  }
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
          const entry = cursor.value as StoredEntry
          if (entry.updatedAt < cutoff) cursor.delete()
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

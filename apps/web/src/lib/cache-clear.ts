/**
 * Cache clearing utility
 * This runs on app initialization to clear IndexedDB if requested.
 */

const FALLBACK_INDEXED_DB_CACHE_NAMES = [
  'nostr-events',
  'nostr-idb',
  'nostube-p2p-hls-blob-cache',
  'nostube-play-positions',
]

const CLEAR_ON_LOAD_KEY = 'clearCacheOnLoad'
const CLEAR_TIMEOUT_MS = 5000

function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = CLEAR_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(resolve, timeoutMs, fallback)),
  ])
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise(resolve => {
    if (import.meta.env.DEV) console.log(`[Cache Clear] Deleting database: ${name}`)

    const request = window.indexedDB.deleteDatabase(name)
    let settled = false

    const finish = (message?: string) => {
      if (settled) return
      settled = true
      if (message && import.meta.env.DEV) console.log(message)
      resolve()
    }

    request.onsuccess = () => finish(`[Cache Clear] Successfully deleted: ${name}`)
    request.onerror = () => {
      console.error(`[Cache Clear] Failed to delete: ${name}`)
      finish()
    }
    request.onblocked = () => {
      console.warn(`[Cache Clear] Database ${name} is blocked`)
      finish()
    }
  })
}

async function getIndexedDatabaseNames(): Promise<string[]> {
  if ('databases' in window.indexedDB) {
    const databases = await withTimeout(window.indexedDB.databases(), [])

    if (import.meta.env.DEV) {
      console.log(
        '[Cache Clear] Found databases:',
        databases.map(db => db.name)
      )
    }

    return databases
      .map(database => database.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
  }

  return FALLBACK_INDEXED_DB_CACHE_NAMES
}

async function deleteIndexedDatabaseCaches(): Promise<void> {
  const databaseNames = await getIndexedDatabaseNames()

  await withTimeout(Promise.all(databaseNames.map(deleteDatabase)), [])
}

async function deleteCacheStorageCaches(): Promise<void> {
  if (!('caches' in window)) return

  const cacheNames = await withTimeout(window.caches.keys(), [])
  await withTimeout(Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName))), [])
}

export async function clearBrowserCacheData(): Promise<boolean> {
  try {
    await Promise.all([deleteIndexedDatabaseCaches(), deleteCacheStorageCaches()])

    if (import.meta.env.DEV) console.log('[Cache Clear] Cache clear completed')
    return true
  } catch (error) {
    console.error('[Cache Clear] Error clearing cache:', error)
    return false
  }
}

export function clearBrowserCacheDataOnReload(): void {
  sessionStorage.setItem(CLEAR_ON_LOAD_KEY, 'true')
  window.location.reload()
}

export async function checkAndClearCache(): Promise<boolean> {
  const shouldClear = sessionStorage.getItem(CLEAR_ON_LOAD_KEY)

  if (shouldClear !== 'true') {
    return false
  }

  // Remove the flag first
  sessionStorage.removeItem(CLEAR_ON_LOAD_KEY)

  if (import.meta.env.DEV) console.log('[Cache Clear] Starting cache clear operation...')

  return clearBrowserCacheData()
}

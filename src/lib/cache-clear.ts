/**
 * Cache clearing utility
 * This runs on app initialization to clear IndexedDB if requested.
 */

const FALLBACK_INDEXED_DB_CACHE_NAMES = [
  'nostr-events',
  'nostr-idb',
  'nostube-p2p-hls-blob-cache',
]

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
    const databases = await window.indexedDB.databases()

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

  await Promise.race([
    Promise.all(databaseNames.map(deleteDatabase)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
}

async function deleteCacheStorageCaches(): Promise<void> {
  if (!('caches' in window)) return

  const cacheNames = await window.caches.keys()
  await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)))
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

export async function checkAndClearCache(): Promise<boolean> {
  const shouldClear = sessionStorage.getItem('clearCacheOnLoad')

  if (shouldClear !== 'true') {
    return false
  }

  // Remove the flag first
  sessionStorage.removeItem('clearCacheOnLoad')

  if (import.meta.env.DEV) console.log('[Cache Clear] Starting cache clear operation...')

  return clearBrowserCacheData()
}

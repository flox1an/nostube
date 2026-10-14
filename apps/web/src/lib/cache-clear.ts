/**
 * Cache clearing utility
 * This runs on app initialization to clear the cache databases if requested.
 */

/**
 * Only real caches: Nostr event cache (nostr-idb), trust scores, playlist validation verdicts.
 * Play positions, the view-event outbox and the service-worker precache must survive a clear.
 */
export const CACHE_DATABASE_NAMES = [
  'nostr-idb',
  'nostube-trust-scores',
  'nostube-playlist-validation',
] as const

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

export async function clearBrowserCacheData(): Promise<boolean> {
  try {
    await withTimeout(Promise.all(CACHE_DATABASE_NAMES.map(deleteDatabase)), [])

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

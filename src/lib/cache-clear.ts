/**
 * Cache clearing utility
 * This runs on app initialization to clear IndexedDB if requested
 */

export async function checkAndClearCache(): Promise<boolean> {
  const shouldClear = sessionStorage.getItem('clearCacheOnLoad')

  if (shouldClear !== 'true') {
    return false
  }

  // Remove the flag first
  sessionStorage.removeItem('clearCacheOnLoad')

  console.log('[Cache Clear] Starting cache clear operation...')

  try {
    // Get all databases
    let databases: IDBDatabaseInfo[] = []

    if ('databases' in window.indexedDB) {
      databases = await window.indexedDB.databases()
    } else {
      // Fallback for browsers without databases() API
      databases = [
        { name: 'nostr-events', version: 1 },
        { name: 'nostr-idb', version: 1 },
      ] as IDBDatabaseInfo[]
    }

    console.log(
      '[Cache Clear] Found databases:',
      databases.map(db => db.name)
    )

    // Delete each database
    const deletePromises = databases
      .filter(db => db.name)
      .map(db => {
        return new Promise<void>((resolve, _reject) => {
          console.log(`[Cache Clear] Deleting database: ${db.name}`)
          const request = window.indexedDB.deleteDatabase(db.name!)

          request.onsuccess = () => {
            console.log(`[Cache Clear] Successfully deleted: ${db.name}`)
            resolve()
          }

          request.onerror = () => {
            console.error(`[Cache Clear] Failed to delete: ${db.name}`)
            // Don't reject, continue with others
            resolve()
          }

          request.onblocked = () => {
            console.warn(`[Cache Clear] Database ${db.name} is blocked`)
            // Don't wait, continue
            resolve()
          }
        })
      })

    // Wait for all deletions with timeout
    await Promise.race([
      Promise.all(deletePromises),
      new Promise(resolve => setTimeout(resolve, 5000)), // 5 second timeout
    ])

    console.log('[Cache Clear] Cache clear completed')
    return true
  } catch (error) {
    console.error('[Cache Clear] Error clearing cache:', error)
    return false
  }
}

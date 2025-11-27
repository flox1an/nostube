/**
 * EventCache - Cache Nostr video events in localStorage
 *
 * Features:
 * - LocalStorage cache with 1-hour TTL
 * - Caches video events (kinds 34235, 34236, 21, 22)
 * - Reduces relay load for frequently accessed videos
 * - Automatic cache invalidation after TTL
 */

const CACHE_PREFIX = 'nostube-embed-event-'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export class EventCache {
  /**
   * Get cached event from localStorage
   * @param {string} eventId - Event ID (for nevent) or computed cache key (for naddr)
   * @returns {Object|null} Cached event or null if not found/expired
   */
  static getCachedEvent(eventId) {
    try {
      const key = CACHE_PREFIX + eventId
      const cached = localStorage.getItem(key)

      if (!cached) {
        return null
      }

      const data = JSON.parse(cached)

      if (!EventCache.isCacheValid(data)) {
        localStorage.removeItem(key)
        return null
      }

      return data.event
    } catch (error) {
      console.error('[EventCache] Cache read error:', error)
      return null
    }
  }

  /**
   * Store event in localStorage cache
   * @param {string} eventId - Event ID to use as cache key
   * @param {Object} event - Nostr event to cache
   */
  static setCachedEvent(eventId, event) {
    try {
      const key = CACHE_PREFIX + eventId
      const data = {
        event,
        fetchedAt: Date.now(),
      }
      localStorage.setItem(key, JSON.stringify(data))
      console.log(`[EventCache] Cached event ${eventId.substring(0, 8)}...`)
    } catch (error) {
      console.error('[EventCache] Cache write error:', error)
    }
  }

  /**
   * Check if cached data is still valid
   * @param {Object} cachedData - Data from localStorage
   * @returns {boolean} True if valid, false if expired
   */
  static isCacheValid(cachedData) {
    if (!cachedData || !cachedData.fetchedAt) {
      return false
    }

    const age = Date.now() - cachedData.fetchedAt
    return age < CACHE_TTL_MS
  }

  /**
   * Generate cache key for addressable events (naddr)
   * Combines kind, pubkey, and d-tag to create unique identifier
   * @param {number} kind - Event kind
   * @param {string} pubkey - Author pubkey
   * @param {string} identifier - d-tag identifier
   * @returns {string} Cache key
   */
  static getAddressableKey(kind, pubkey, identifier) {
    return `${kind}:${pubkey}:${identifier}`
  }

  /**
   * Clear all cached events from localStorage
   * Useful for debugging or when storage is full
   */
  static clearAll() {
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(CACHE_PREFIX)) {
          keys.push(key)
        }
      }

      keys.forEach(key => localStorage.removeItem(key))
      console.log(`[EventCache] Cleared ${keys.length} cached events`)
    } catch (error) {
      console.error('[EventCache] Clear all error:', error)
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats about cached events
   */
  static getStats() {
    try {
      let count = 0
      let validCount = 0
      let totalSize = 0

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(CACHE_PREFIX)) {
          count++
          const value = localStorage.getItem(key)
          if (value) {
            totalSize += value.length

            try {
              const data = JSON.parse(value)
              if (EventCache.isCacheValid(data)) {
                validCount++
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      return {
        totalCached: count,
        validCached: validCount,
        expiredCached: count - validCount,
        totalSizeBytes: totalSize,
        totalSizeKB: Math.round(totalSize / 1024),
      }
    } catch (error) {
      console.error('[EventCache] Stats error:', error)
      return {
        totalCached: 0,
        validCached: 0,
        expiredCached: 0,
        totalSizeBytes: 0,
        totalSizeKB: 0,
      }
    }
  }
}

import type { NostrEvent } from 'nostr-tools'

const CACHE_PREFIX = 'nostube-embed-event-'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CachedData {
  event: NostrEvent
  fetchedAt: number
}

/**
 * EventCache - Cache Nostr video events in localStorage
 */
export class EventCache {
  /**
   * Get cached event from localStorage
   */
  static getCachedEvent(eventId: string): NostrEvent | null {
    try {
      const key = CACHE_PREFIX + eventId
      const cached = localStorage.getItem(key)

      if (!cached) {
        return null
      }

      const data: CachedData = JSON.parse(cached)

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
   */
  static setCachedEvent(eventId: string, event: NostrEvent): void {
    try {
      const key = CACHE_PREFIX + eventId
      const data: CachedData = {
        event,
        fetchedAt: Date.now(),
      }
      localStorage.setItem(key, JSON.stringify(data))
    } catch (error) {
      console.error('[EventCache] Cache write error:', error)
    }
  }

  /**
   * Check if cached data is still valid
   */
  static isCacheValid(cachedData: CachedData): boolean {
    if (!cachedData || !cachedData.fetchedAt) {
      return false
    }
    const age = Date.now() - cachedData.fetchedAt
    return age < CACHE_TTL_MS
  }

  /**
   * Generate cache key for addressable events (naddr)
   */
  static getAddressableKey(kind: number, pubkey: string, identifier: string): string {
    return `${kind}:${pubkey}:${identifier}`
  }
}

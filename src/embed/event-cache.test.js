/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventCache } from './event-cache.js'

describe('EventCache', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Cache operations', () => {
    const testEventId = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
    const testEvent = {
      id: testEventId,
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 1234567890,
      kind: 34235,
      tags: [
        ['d', 'test-video'],
        ['title', 'Test Video'],
        ['url', 'https://example.com/video.mp4'],
      ],
      content: 'Test description',
      sig: 'abc123...',
    }

    it('should cache event data', () => {
      EventCache.setCachedEvent(testEventId, testEvent)

      const cached = EventCache.getCachedEvent(testEventId)

      expect(cached).toEqual(testEvent)
    })

    it('should return null for non-existent cache', () => {
      const cached = EventCache.getCachedEvent('nonexistent')

      expect(cached).toBeNull()
    })

    it('should include fetchedAt timestamp when caching', () => {
      EventCache.setCachedEvent(testEventId, testEvent)

      const cacheKey = 'nostube-embed-event-' + testEventId
      const cached = JSON.parse(localStorage.getItem(cacheKey))

      expect(cached).toHaveProperty('fetchedAt')
      expect(cached).toHaveProperty('event')
      expect(typeof cached.fetchedAt).toBe('number')
    })

    it('should invalidate expired cache (older than 1 hour)', () => {
      // Create expired cache entry (2 hours old)
      const cacheKey = 'nostube-embed-event-' + testEventId
      const expiredData = {
        event: testEvent,
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      }
      localStorage.setItem(cacheKey, JSON.stringify(expiredData))

      const cached = EventCache.getCachedEvent(testEventId)

      expect(cached).toBeNull()
      // Cache should be removed
      expect(localStorage.getItem(cacheKey)).toBeNull()
    })

    it('should return valid cache within TTL (1 hour)', () => {
      // Create recent cache entry (30 minutes old)
      const cacheKey = 'nostube-embed-event-' + testEventId
      const recentData = {
        event: testEvent,
        fetchedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      }
      localStorage.setItem(cacheKey, JSON.stringify(recentData))

      const cached = EventCache.getCachedEvent(testEventId)

      expect(cached).toEqual(testEvent)
    })

    it('should cache event at exact 1 hour boundary (should be invalid)', () => {
      // Create cache entry exactly 1 hour old
      const cacheKey = 'nostube-embed-event-' + testEventId
      const boundaryData = {
        event: testEvent,
        fetchedAt: Date.now() - 60 * 60 * 1000, // Exactly 1 hour ago
      }
      localStorage.setItem(cacheKey, JSON.stringify(boundaryData))

      const cached = EventCache.getCachedEvent(testEventId)

      // Should be null because cache is not valid (>= TTL)
      expect(cached).toBeNull()
    })
  })

  describe('isCacheValid', () => {
    it('should return true for fresh cache', () => {
      const data = {
        event: {},
        fetchedAt: Date.now(),
      }

      expect(EventCache.isCacheValid(data)).toBe(true)
    })

    it('should return true for cache 59 minutes old', () => {
      const data = {
        event: {},
        fetchedAt: Date.now() - 59 * 60 * 1000, // 59 minutes ago
      }

      expect(EventCache.isCacheValid(data)).toBe(true)
    })

    it('should return false for expired cache (over 1 hour)', () => {
      const data = {
        event: {},
        fetchedAt: Date.now() - 61 * 60 * 1000, // 61 minutes ago
      }

      expect(EventCache.isCacheValid(data)).toBe(false)
    })

    it('should return false for missing fetchedAt', () => {
      const data = {
        event: {},
      }

      expect(EventCache.isCacheValid(data)).toBe(false)
    })

    it('should return false for null data', () => {
      expect(EventCache.isCacheValid(null)).toBe(false)
    })
  })

  describe('getAddressableKey', () => {
    it('should generate correct key for addressable event', () => {
      const kind = 34235
      const pubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const identifier = 'my-video'

      const key = EventCache.getAddressableKey(kind, pubkey, identifier)

      expect(key).toBe(
        '34235:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef:my-video'
      )
    })

    it('should generate unique keys for different events', () => {
      const pubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      const key1 = EventCache.getAddressableKey(34235, pubkey, 'video-1')
      const key2 = EventCache.getAddressableKey(34235, pubkey, 'video-2')

      expect(key1).not.toBe(key2)
    })

    it('should generate unique keys for different kinds', () => {
      const pubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const identifier = 'video-1'

      const key1 = EventCache.getAddressableKey(34235, pubkey, identifier)
      const key2 = EventCache.getAddressableKey(34236, pubkey, identifier)

      expect(key1).not.toBe(key2)
    })
  })

  describe('clearAll', () => {
    it('should clear all cached events', () => {
      // Add multiple events
      EventCache.setCachedEvent('event1', { id: 'event1' })
      EventCache.setCachedEvent('event2', { id: 'event2' })
      EventCache.setCachedEvent('event3', { id: 'event3' })

      // Clear all
      EventCache.clearAll()

      // Verify all are gone
      expect(EventCache.getCachedEvent('event1')).toBeNull()
      expect(EventCache.getCachedEvent('event2')).toBeNull()
      expect(EventCache.getCachedEvent('event3')).toBeNull()
    })

    it('should not clear non-event cache items', () => {
      // Add event cache
      EventCache.setCachedEvent('event1', { id: 'event1' })

      // Add non-event item
      localStorage.setItem('other-key', 'other-value')

      // Clear all event cache
      EventCache.clearAll()

      // Event cache should be gone
      expect(EventCache.getCachedEvent('event1')).toBeNull()

      // Other item should remain
      expect(localStorage.getItem('other-key')).toBe('other-value')
    })
  })

  describe('getStats', () => {
    it('should return correct stats for empty cache', () => {
      const stats = EventCache.getStats()

      expect(stats).toEqual({
        totalCached: 0,
        validCached: 0,
        expiredCached: 0,
        totalSizeBytes: 0,
        totalSizeKB: 0,
      })
    })

    it('should return correct stats with cached events', () => {
      // Add valid events
      EventCache.setCachedEvent('event1', { id: 'event1', title: 'Video 1' })
      EventCache.setCachedEvent('event2', { id: 'event2', title: 'Video 2' })

      const stats = EventCache.getStats()

      expect(stats.totalCached).toBe(2)
      expect(stats.validCached).toBe(2)
      expect(stats.expiredCached).toBe(0)
      expect(stats.totalSizeBytes).toBeGreaterThan(0)
      expect(stats.totalSizeKB).toBeGreaterThan(0)
    })

    it('should count expired events correctly', () => {
      // Add valid event
      EventCache.setCachedEvent('event1', { id: 'event1' })

      // Add expired event manually
      const expiredData = {
        event: { id: 'event2' },
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      }
      localStorage.setItem('nostube-embed-event-event2', JSON.stringify(expiredData))

      const stats = EventCache.getStats()

      expect(stats.totalCached).toBe(2)
      expect(stats.validCached).toBe(1)
      expect(stats.expiredCached).toBe(1)
    })
  })

  describe('localStorage error handling', () => {
    it('should handle localStorage write errors gracefully', () => {
      // Mock localStorage.setItem to throw error
      const originalSetItem = localStorage.setItem
      localStorage.setItem = () => {
        throw new Error('Storage quota exceeded')
      }

      const testEventId = 'test123'
      const testEvent = { id: testEventId }

      // Should not throw
      expect(() => {
        EventCache.setCachedEvent(testEventId, testEvent)
      }).not.toThrow()

      // Restore
      localStorage.setItem = originalSetItem
    })

    it('should handle localStorage read errors gracefully', () => {
      // Mock localStorage.getItem to throw error
      const originalGetItem = localStorage.getItem
      localStorage.getItem = () => {
        throw new Error('Storage access denied')
      }

      const testEventId = 'test123'

      // Should return null instead of throwing
      const result = EventCache.getCachedEvent(testEventId)
      expect(result).toBeNull()

      // Restore
      localStorage.getItem = originalGetItem
    })

    it('should handle malformed cache data', () => {
      const testEventId = 'test123'
      const cacheKey = 'nostube-embed-event-' + testEventId

      // Store invalid JSON
      localStorage.setItem(cacheKey, 'not valid json{')

      const result = EventCache.getCachedEvent(testEventId)
      expect(result).toBeNull()
    })
  })
})

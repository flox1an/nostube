/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ProfileFetcher } from './profile-fetcher.js'

describe('ProfileFetcher', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('parseProfileMetadata', () => {
    it('should parse valid profile JSON', () => {
      const event = {
        content: JSON.stringify({
          picture: 'https://example.com/avatar.jpg',
          display_name: 'Alice Smith',
          name: 'alice',
          nip05: 'alice@example.com',
          about: 'Test bio',
        }),
      }

      const profile = ProfileFetcher.parseProfileMetadata(event)

      expect(profile).toEqual({
        picture: 'https://example.com/avatar.jpg',
        displayName: 'Alice Smith',
        name: 'alice',
        nip05: 'alice@example.com',
        about: 'Test bio',
      })
    })

    it('should handle missing fields gracefully', () => {
      const event = {
        content: JSON.stringify({
          name: 'alice',
        }),
      }

      const profile = ProfileFetcher.parseProfileMetadata(event)

      expect(profile).toEqual({
        picture: null,
        displayName: null,
        name: 'alice',
        nip05: null,
        about: null,
      })
    })

    it('should handle invalid JSON gracefully', () => {
      const event = {
        content: 'not valid json',
      }

      const profile = ProfileFetcher.parseProfileMetadata(event)

      expect(profile).toEqual({
        picture: null,
        displayName: null,
        name: null,
        nip05: null,
        about: null,
      })
    })

    it('should handle empty content', () => {
      const event = {
        content: '{}',
      }

      const profile = ProfileFetcher.parseProfileMetadata(event)

      expect(profile).toEqual({
        picture: null,
        displayName: null,
        name: null,
        nip05: null,
        about: null,
      })
    })
  })

  describe('Cache operations', () => {
    const testPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const testProfile = {
      picture: 'https://example.com/avatar.jpg',
      displayName: 'Test User',
      name: 'testuser',
      nip05: 'test@example.com',
      about: 'Test bio',
    }

    it('should cache profile data', () => {
      ProfileFetcher.setCachedProfile(testPubkey, testProfile)

      const cached = ProfileFetcher.getCachedProfile(testPubkey)

      expect(cached).toEqual(testProfile)
    })

    it('should return null for non-existent cache', () => {
      const cached = ProfileFetcher.getCachedProfile('nonexistent')

      expect(cached).toBeNull()
    })

    it('should include fetchedAt timestamp when caching', () => {
      ProfileFetcher.setCachedProfile(testPubkey, testProfile)

      const cacheKey = 'nostube-embed-profile-' + testPubkey
      const cached = JSON.parse(localStorage.getItem(cacheKey))

      expect(cached).toHaveProperty('fetchedAt')
      expect(cached).toHaveProperty('profile')
      expect(typeof cached.fetchedAt).toBe('number')
    })

    it('should invalidate expired cache', () => {
      // Create expired cache entry (25 hours old)
      const cacheKey = 'nostube-embed-profile-' + testPubkey
      const expiredData = {
        profile: testProfile,
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      }
      localStorage.setItem(cacheKey, JSON.stringify(expiredData))

      const cached = ProfileFetcher.getCachedProfile(testPubkey)

      expect(cached).toBeNull()
      // Cache should be removed
      expect(localStorage.getItem(cacheKey)).toBeNull()
    })

    it('should return valid cache within TTL', () => {
      // Create recent cache entry (1 hour old)
      const cacheKey = 'nostube-embed-profile-' + testPubkey
      const recentData = {
        profile: testProfile,
        fetchedAt: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
      }
      localStorage.setItem(cacheKey, JSON.stringify(recentData))

      const cached = ProfileFetcher.getCachedProfile(testPubkey)

      expect(cached).toEqual(testProfile)
    })
  })

  describe('isCacheValid', () => {
    it('should return true for fresh cache', () => {
      const data = {
        profile: {},
        fetchedAt: Date.now(),
      }

      expect(ProfileFetcher.isCacheValid(data)).toBe(true)
    })

    it('should return false for expired cache', () => {
      const data = {
        profile: {},
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      }

      expect(ProfileFetcher.isCacheValid(data)).toBe(false)
    })

    it('should return false for missing fetchedAt', () => {
      const data = {
        profile: {},
      }

      expect(ProfileFetcher.isCacheValid(data)).toBe(false)
    })

    it('should return false for null data', () => {
      expect(ProfileFetcher.isCacheValid(null)).toBe(false)
    })
  })

  describe('fetchProfile', () => {
    it('should return null for invalid inputs', async () => {
      const mockClient = {}
      const fetcher = new ProfileFetcher(mockClient)

      // No pubkey
      expect(await fetcher.fetchProfile(null, ['wss://relay.example.com'])).toBeNull()

      // No relays
      expect(await fetcher.fetchProfile('pubkey123', [])).toBeNull()
      expect(await fetcher.fetchProfile('pubkey123', null)).toBeNull()
    })

    it('should return cached profile if available', async () => {
      const testPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const testProfile = {
        picture: 'https://example.com/avatar.jpg',
        displayName: 'Cached User',
        name: 'cacheduser',
        nip05: null,
        about: null,
      }

      // Set up cache
      ProfileFetcher.setCachedProfile(testPubkey, testProfile)

      const mockClient = {
        connectRelay: vi.fn(),
      }
      const fetcher = new ProfileFetcher(mockClient)

      const result = await fetcher.fetchProfile(testPubkey, ['wss://relay.example.com'])

      expect(result).toEqual(testProfile)
      // Should not attempt relay connection
      expect(mockClient.connectRelay).not.toHaveBeenCalled()
    })
  })

  describe('localStorage error handling', () => {
    it('should handle localStorage write errors gracefully', () => {
      // Mock localStorage.setItem to throw error
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      const testPubkey = 'test123'
      const testProfile = { name: 'test' }

      // Should not throw
      expect(() => {
        ProfileFetcher.setCachedProfile(testPubkey, testProfile)
      }).not.toThrow()

      // Restore
      localStorage.setItem = originalSetItem
    })

    it('should handle localStorage read errors gracefully', () => {
      // Mock localStorage.getItem to throw error
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => {
        throw new Error('Storage access denied')
      })

      const testPubkey = 'test123'

      // Should return null instead of throwing
      const result = ProfileFetcher.getCachedProfile(testPubkey)
      expect(result).toBeNull()

      // Restore
      localStorage.getItem = originalGetItem
    })

    it('should handle malformed cache data', () => {
      const testPubkey = 'test123'
      const cacheKey = 'nostube-embed-profile-' + testPubkey

      // Store invalid JSON
      localStorage.setItem(cacheKey, 'not valid json{')

      const result = ProfileFetcher.getCachedProfile(testPubkey)
      expect(result).toBeNull()
    })
  })
})

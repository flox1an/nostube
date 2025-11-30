import { describe, it, expect, beforeEach } from 'vitest'
import {
  getNotificationStorage,
  saveNotificationStorage,
  cleanupOldNotifications,
} from './notification-storage'
import type { VideoNotification } from '../types/notification'

describe('notification-storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getNotificationStorage', () => {
    it('should return default structure when localStorage is empty', () => {
      const result = getNotificationStorage()
      expect(result).toEqual({
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      })
    })

    it('should parse and return stored notifications', () => {
      const stored = {
        lastLoginTime: 1234567890,
        notifications: [
          {
            id: 'note1',
            commentId: 'note1',
            videoId: 'video1',
            commenterPubkey: 'pubkey1',
            commentContent: 'Great video!',
            timestamp: 1234567890,
            read: false,
            videoEventId: 'nevent1...',
          },
        ],
        lastFetchTime: 1234567890,
      }
      localStorage.setItem('nostube_notifications', JSON.stringify(stored))

      const result = getNotificationStorage()
      expect(result).toEqual(stored)
    })

    it('should handle corrupted data gracefully', () => {
      localStorage.setItem('nostube_notifications', 'invalid json')
      const result = getNotificationStorage()
      expect(result).toEqual({
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      })
    })
  })

  describe('saveNotificationStorage', () => {
    it('should save notifications to localStorage', () => {
      const data = {
        lastLoginTime: 1234567890,
        notifications: [],
        lastFetchTime: 1234567890,
      }
      saveNotificationStorage(data)

      const stored = localStorage.getItem('nostube_notifications')
      expect(JSON.parse(stored!)).toEqual(data)
    })
  })

  describe('cleanupOldNotifications', () => {
    it('should remove notifications older than 7 days', () => {
      const now = Date.now() / 1000
      const eightDaysAgo = now - 8 * 24 * 60 * 60

      const notifications: VideoNotification[] = [
        {
          id: 'recent',
          commentId: 'recent',
          videoId: 'v1',
          commenterPubkey: 'pk1',
          commentContent: 'Recent',
          timestamp: now,
          read: false,
          videoEventId: 'ne1',
        },
        {
          id: 'old',
          commentId: 'old',
          videoId: 'v2',
          commenterPubkey: 'pk2',
          commentContent: 'Old',
          timestamp: eightDaysAgo,
          read: false,
          videoEventId: 'ne2',
        },
      ]

      const result = cleanupOldNotifications(notifications)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('recent')
    })

    it('should limit to 100 most recent notifications', () => {
      const now = Date.now() / 1000
      const notifications: VideoNotification[] = Array.from({ length: 150 }, (_, i) => ({
        id: `note${i}`,
        commentId: `note${i}`,
        videoId: `v${i}`,
        commenterPubkey: `pk${i}`,
        commentContent: `Comment ${i}`,
        timestamp: now - i,
        read: false,
        videoEventId: `ne${i}`,
      }))

      const result = cleanupOldNotifications(notifications)
      expect(result).toHaveLength(100)
    })

    it('should sort by timestamp descending (newest first)', () => {
      const now = Date.now() / 1000
      const notifications: VideoNotification[] = [
        {
          id: 'n1',
          commentId: 'n1',
          videoId: 'v1',
          commenterPubkey: 'pk1',
          commentContent: 'First',
          timestamp: now - 3600, // 1 hour ago
          read: false,
          videoEventId: 'ne1',
        },
        {
          id: 'n2',
          commentId: 'n2',
          videoId: 'v2',
          commenterPubkey: 'pk2',
          commentContent: 'Second',
          timestamp: now - 1800, // 30 minutes ago
          read: false,
          videoEventId: 'ne2',
        },
      ]

      const result = cleanupOldNotifications(notifications)
      expect(result[0].id).toBe('n2') // newer one first
      expect(result[1].id).toBe('n1')
    })
  })
})

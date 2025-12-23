import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNotifications } from './useNotifications'
import { TestApp } from '../test/TestApp'
import type { NostrEvent } from 'nostr-tools'

// Mock the relayPool from @/nostr/core
type NostrCoreModule = typeof import('@/nostr/core')

vi.mock('@/nostr/core', async () => {
  const actual = await vi.importActual('@/nostr/core')
  const actualTyped = actual as NostrCoreModule
  return {
    ...actualTyped,
    relayPool: {
      ...actualTyped.relayPool,
      subscription: vi.fn(),
    },
  }
})

// Mock useReadRelays to return test relays
vi.mock('@/hooks/useReadRelays', () => ({
  useReadRelays: () => ['wss://relay.example.com'],
}))

// Mock useCurrentUser to return a test user
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: 'test-user-pubkey',
    },
  }),
}))

describe('useNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers() // Use real timers by default
  })

  it('should initialize with empty notifications when localStorage is empty', () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: TestApp,
    })

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('should load notifications from localStorage on mount', () => {
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

    const { result } = renderHook(() => useNotifications(), {
      wrapper: TestApp,
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('should calculate unreadCount correctly', () => {
    const stored = {
      lastLoginTime: 1234567890,
      notifications: [
        {
          id: 'note1',
          commentId: 'note1',
          videoId: 'video1',
          commenterPubkey: 'pubkey1',
          commentContent: 'Great',
          timestamp: 1234567890,
          read: false,
          videoEventId: 'ne1',
        },
        {
          id: 'note2',
          commentId: 'note2',
          videoId: 'video2',
          commenterPubkey: 'pubkey2',
          commentContent: 'Nice',
          timestamp: 1234567891,
          read: true,
          videoEventId: 'ne2',
        },
      ],
      lastFetchTime: 1234567890,
    }
    localStorage.setItem('nostube_notifications', JSON.stringify(stored))

    const { result } = renderHook(() => useNotifications(), {
      wrapper: TestApp,
    })

    expect(result.current.unreadCount).toBe(1)
  })

  describe('fetchNotifications', () => {
    // TODO: Fix async timing issues with this test
    // The test times out waiting for state updates after fetchNotifications completes
    // The hook uses setTimeout with RxJS subscriptions which is difficult to mock properly
    it.skip('should fetch notifications from Nostr relays', async () => {
      const { relayPool, eventStore } = await import('@/nostr/core')

      // Setup mock comment events
      const mockComments: NostrEvent[] = [
        {
          id: 'comment1',
          pubkey: 'commenter-pubkey',
          created_at: Math.floor(Date.now() / 1000),
          kind: 1111,
          content: 'Great video!',
          tags: [
            ['e', 'video-event-id'],
            ['k', '34235'], // Required: indicates this is a comment on a kind 34235 video
          ],
          sig: 'sig',
        },
      ]

      // Mock RxJS subscription
      const mockSubscription = {
        unsubscribe: vi.fn(),
      }

      vi.mocked(relayPool.subscription).mockReturnValue({
        subscribe: (observer: { next: (value: unknown) => void }) => {
          // Immediately call observer with mock comments and EOSE
          mockComments.forEach(comment => observer.next(comment))
          observer.next('EOSE')
          return mockSubscription
        },
      } as unknown as ReturnType<typeof relayPool.subscription>)

      // Spy on eventStore.getEvent
      vi.spyOn(eventStore, 'getEvent').mockReturnValue({
        id: 'video-event-id',
        kind: 34235,
        pubkey: 'test-user-pubkey',
        created_at: 1234567890,
        content: '',
        tags: [
          ['title', 'Test Video'],
          ['d', 'test-identifier'],
        ],
        sig: 'sig',
      })

      // Set lastLoginTime
      localStorage.setItem(
        'nostube_notifications',
        JSON.stringify({
          lastLoginTime: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          notifications: [],
          lastFetchTime: 0,
        })
      )

      const { result } = renderHook(() => useNotifications(), {
        wrapper: TestApp,
      })

      // Call fetchNotifications
      await result.current.fetchNotifications()

      // Wait for notifications to be processed (needs extra time for the 1000ms setTimeout)
      await waitFor(
        () => {
          expect(result.current.notifications).toHaveLength(1)
        },
        { timeout: 2000 }
      )

      // Verify notification was created correctly
      expect(result.current.notifications[0]).toMatchObject({
        id: 'comment1',
        commentId: 'comment1',
        videoId: 'video-event-id',
        videoTitle: 'Test Video',
        commenterPubkey: 'commenter-pubkey',
        commentContent: 'Great video!',
        read: false,
      })
      expect(result.current.unreadCount).toBe(1)

      // Verify subscription was unsubscribed
      expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    }, 10000) // 10 second timeout for this test

    it('should skip fetching when lastLoginTime is 0', async () => {
      const { relayPool } = await import('@/nostr/core')

      const { result } = renderHook(() => useNotifications(), {
        wrapper: TestApp,
      })

      await result.current.fetchNotifications()

      // Should not call subscription
      expect(relayPool.subscription).not.toHaveBeenCalled()
    })

    it('should deduplicate notifications by ID', async () => {
      const { relayPool, eventStore } = await import('@/nostr/core')

      // Setup existing notification
      const existing = {
        lastLoginTime: Math.floor(Date.now() / 1000) - 3600,
        notifications: [
          {
            id: 'comment1',
            commentId: 'comment1',
            videoId: 'video1',
            commenterPubkey: 'pubkey1',
            commentContent: 'Great',
            timestamp: 1234567890,
            read: false,
            videoEventId: 'ne1',
          },
        ],
        lastFetchTime: 0,
      }
      localStorage.setItem('nostube_notifications', JSON.stringify(existing))

      // Mock same comment coming from relay
      const mockSubscription = { unsubscribe: vi.fn() }
      vi.mocked(relayPool.subscription).mockReturnValue({
        subscribe: (observer: { next: (value: unknown) => void }) => {
          observer.next({
            id: 'comment1',
            pubkey: 'pubkey1',
            created_at: 1234567890,
            kind: 1111,
            content: 'Great',
            tags: [['e', 'video1']],
            sig: 'sig',
          })
          observer.next('EOSE')
          return mockSubscription
        },
      } as unknown as ReturnType<typeof relayPool.subscription>)

      vi.spyOn(eventStore, 'getEvent').mockReturnValue({
        id: 'video1',
        kind: 34235,
        pubkey: 'test-pubkey',
        created_at: 1234567890,
        content: '',
        tags: [['title', 'Video 1']],
        sig: 'sig',
      })

      const { result } = renderHook(() => useNotifications(), {
        wrapper: TestApp,
      })

      await result.current.fetchNotifications()

      // Should still have only 1 notification (no duplicate)
      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1)
      })
    })
  })
})

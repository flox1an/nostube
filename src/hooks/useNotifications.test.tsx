import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNotifications } from './useNotifications'
import { TestApp } from '../test/TestApp'

describe('useNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
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
})

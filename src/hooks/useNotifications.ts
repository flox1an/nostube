import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { NostrEvent } from 'nostr-tools'
import type { VideoNotification } from '../types/notification'
import {
  getNotificationStorage,
  saveNotificationStorage,
  cleanupOldNotifications,
} from '../lib/notification-storage'
import { generateEventLink } from '../lib/nostr'
import { useCurrentUser } from './useCurrentUser'
import { useEventStore } from 'applesauce-react/hooks'
import { relayPool } from '@/nostr/core'

const POLL_INTERVAL_MS = 150000 // 2.5 minutes

export function useNotifications() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const [notifications, setNotifications] = useState<VideoNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFetchingRef = useRef(false)

  // Load notifications from localStorage on mount
  useEffect(() => {
    const storage = getNotificationStorage()
    setNotifications(storage.notifications)
  }, [])

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))

      // Save to localStorage
      const storage = getNotificationStorage()
      storage.notifications = updated
      saveNotificationStorage(storage)

      return updated
    })
  }, [])

  // Fetch notifications from Nostr relays
  const fetchNotifications = useCallback(async () => {
    if (!user || isFetchingRef.current) return

    isFetchingRef.current = true
    setIsLoading(true)
    setError(null) // Clear previous errors

    try {
      const storage = getNotificationStorage()
      const { lastLoginTime } = storage

      if (lastLoginTime === 0) {
        // User hasn't logged in yet, skip
        return
      }

      // Get relays from config - we'll use the default relays from the pool
      const relays: string[] = [] // Empty array will use pool's default relays

      // Query for comments on user's videos using NIP-22 #P tag
      const filter = {
        kinds: [1111],
        '#P': [user.pubkey],
        since: lastLoginTime,
        limit: 100,
      }

      const comments: NostrEvent[] = []

      await new Promise<void>(resolve => {
        let timeoutId: NodeJS.Timeout | undefined

        // Create subscription using RxJS observable pattern
        const subscription = relayPool.subscription(relays, [filter]).subscribe({
          next: msg => {
            // Filter out EOSE messages
            if (typeof msg !== 'string' && 'kind' in msg) {
              comments.push(msg)
            } else if (msg === 'EOSE') {
              // End of stored events - wait a bit more for any late arrivals
              if (!timeoutId) {
                timeoutId = setTimeout(() => {
                  subscription.unsubscribe()
                  resolve()
                }, 1000)
              }
            }
          },
          error: err => {
            console.error('Subscription error:', err)
            subscription.unsubscribe()
            resolve()
          },
        })

        // Set overall timeout
        const overallTimeout = setTimeout(() => {
          subscription.unsubscribe()
          resolve()
        }, 5000) // 5 second overall timeout

        // Cleanup
        return () => {
          clearTimeout(overallTimeout)
          if (timeoutId) clearTimeout(timeoutId)
        }
      })

      // Process comments into notifications
      const newNotifications: VideoNotification[] = []

      for (const comment of comments) {
        // Extract video ID from 'e' tag
        const eTag = comment.tags.find(t => t[0] === 'e')
        if (!eTag) continue

        const videoId = eTag[1]

        // Fetch video metadata from eventStore
        const videoEvent = eventStore.getEvent(videoId)
        const videoTitle = videoEvent?.tags.find(t => t[0] === 'title')?.[1] || 'Unknown video'

        // Extract identifier for addressable events
        const identifier = videoEvent?.tags.find(t => t[0] === 'd')?.[1]

        // Create notification
        const notification: VideoNotification = {
          id: comment.id,
          commentId: comment.id,
          videoId,
          videoTitle,
          commenterPubkey: comment.pubkey,
          commentContent: comment.content.slice(0, 100),
          timestamp: comment.created_at,
          read: false,
          videoEventId: videoEvent
            ? generateEventLink(
                { id: videoEvent.id, kind: videoEvent.kind, pubkey: videoEvent.pubkey },
                identifier,
                []
              )
            : generateEventLink({ id: videoId, kind: 34235, pubkey: user.pubkey }),
        }

        newNotifications.push(notification)
      }

      // Merge with existing notifications (deduplicate by ID)
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const toAdd = newNotifications.filter(n => !existingIds.has(n.id))
        const merged = [...prev, ...toAdd]

        // Cleanup and save
        const cleaned = cleanupOldNotifications(merged)
        const updatedStorage = getNotificationStorage()
        updatedStorage.notifications = cleaned
        updatedStorage.lastFetchTime = Math.floor(Date.now() / 1000)
        saveNotificationStorage(updatedStorage)

        return cleaned
      })
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      setError('Failed to load notifications')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [user, eventStore])

  // Sync read state across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nostube_notifications' && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue)
          setNotifications(updated.notifications)
        } catch (error) {
          console.error('Failed to sync notifications:', error)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Start polling when user is logged in
  useEffect(() => {
    if (!user) return

    // Initial fetch
    fetchNotifications()

    // Set up polling
    const intervalId = setInterval(() => {
      fetchNotifications()
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [user, fetchNotifications])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    fetchNotifications,
  }
}

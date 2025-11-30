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
import { useReadRelays } from './useReadRelays'

const POLL_INTERVAL_MS = 150000 // 2.5 minutes

export function useNotifications() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const readRelays = useReadRelays()
  const [notifications, setNotifications] = useState<VideoNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFetchingRef = useRef(false)
  const fetchNotificationsRef = useRef<(() => Promise<void>) | null>(null)

  // Store relays in ref to avoid recreating callback
  const relaysRef = useRef<string[]>([])
  relaysRef.current = readRelays

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
  // Store user pubkey and eventStore in refs to avoid recreating callback
  const userPubkeyRef = useRef<string | null>(null)
  userPubkeyRef.current = user?.pubkey || null

  const eventStoreRef = useRef(eventStore)
  eventStoreRef.current = eventStore

  const fetchNotifications = useCallback(async () => {
    const currentUserPubkey = userPubkeyRef.current
    if (!currentUserPubkey || isFetchingRef.current) return

    const storage = getNotificationStorage()
    const { lastLoginTime } = storage

    if (lastLoginTime === 0) {
      // User hasn't logged in yet, skip
      return
    }

    isFetchingRef.current = true
    setIsLoading(true)
    setError(null) // Clear previous errors

    try {
      // Get relays from app config
      const relays = relaysRef.current

      if (relays.length === 0) {
        if (import.meta.env.DEV) {
          console.warn('[useNotifications] No read relays configured, skipping fetch')
        }
        return
      }

      // Query for comments on user's videos using both #P (uppercase) and #p (lowercase) tags
      // Some clients may use lowercase p tag instead of uppercase P
      // Also filter by K tag to only get comments on video events (kinds 21, 22, 34235, 34236)
      const filters = [
        {
          kinds: [1111],
          '#P': [currentUserPubkey],
          '#K': ['21', '22', '34235', '34236'],
          since: lastLoginTime,
          limit: 100,
        },
        {
          kinds: [1111],
          '#p': [currentUserPubkey],
          '#K': ['21', '22', '34235', '34236'],
          since: lastLoginTime,
          limit: 100,
        },
      ]

      const comments: NostrEvent[] = []

      if (import.meta.env.DEV) {
        console.log('[useNotifications] Starting fetch with filters:', {
          filters,
          userPubkey: currentUserPubkey,
          lastLoginTime: new Date(lastLoginTime * 1000).toISOString(),
          relays,
        })
      }

      await new Promise<void>(resolve => {
        let timeoutId: NodeJS.Timeout | undefined
        let eoseCount = 0

        // Create subscription using RxJS observable pattern
        if (import.meta.env.DEV) {
          console.log('[useNotifications] Creating subscription...')
        }
        const subscription = relayPool.subscription(relays, filters).subscribe({
          next: msg => {
            if (import.meta.env.DEV) {
              console.log(
                '[useNotifications] Received message:',
                typeof msg === 'string' ? msg : 'event'
              )
            }
            // Filter out EOSE messages
            if (typeof msg !== 'string' && 'kind' in msg) {
              if (import.meta.env.DEV) {
                console.log('[useNotifications] Received event:', {
                  id: msg.id,
                  kind: msg.kind,
                  pubkey: msg.pubkey,
                  created_at: msg.created_at,
                  created_at_iso: new Date(msg.created_at * 1000).toISOString(),
                  tags: msg.tags,
                  content: msg.content.slice(0, 50),
                })
              }
              comments.push(msg)
            } else if (msg === 'EOSE') {
              eoseCount++
              if (import.meta.env.DEV) {
                console.log('[useNotifications] Received EOSE', eoseCount)
              }
              // End of stored events - wait a bit more for any late arrivals
              if (!timeoutId) {
                timeoutId = setTimeout(() => {
                  if (import.meta.env.DEV) {
                    console.log('[useNotifications] Timeout after EOSE, unsubscribing')
                  }
                  subscription.unsubscribe()
                  resolve()
                }, 1000)
              }
            }
          },
          error: err => {
            console.error('[useNotifications] Subscription error:', err)
            subscription.unsubscribe()
            resolve()
          },
          complete: () => {
            if (import.meta.env.DEV) {
              console.log('[useNotifications] Subscription completed')
            }
            resolve()
          },
        })

        // Set overall timeout
        const overallTimeout = setTimeout(() => {
          if (import.meta.env.DEV) {
            console.log('[useNotifications] Overall timeout reached, unsubscribing')
          }
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

      if (import.meta.env.DEV) {
        console.log('[useNotifications] Processing', comments.length, 'comment events')
      }

      for (const comment of comments) {
        // Extract video ID from 'e' tag
        const eTag = comment.tags.find(t => t[0] === 'e')
        if (!eTag) {
          if (import.meta.env.DEV) {
            console.log('[useNotifications] Skipping comment (no e tag):', comment.id)
          }
          continue
        }

        const videoId = eTag[1]

        // Fetch video metadata from eventStore
        const videoEvent = eventStoreRef.current.getEvent(videoId)
        const videoTitle = videoEvent?.tags.find(t => t[0] === 'title')?.[1] || 'Unknown video'

        if (import.meta.env.DEV) {
          console.log('[useNotifications] Processing comment:', {
            commentId: comment.id,
            videoId,
            videoTitle,
            hasVideoEvent: !!videoEvent,
          })
        }

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
            : generateEventLink({ id: videoId, kind: 34235, pubkey: currentUserPubkey }),
        }

        newNotifications.push(notification)
      }

      if (import.meta.env.DEV) {
        console.log('[useNotifications] Created', newNotifications.length, 'new notifications')
      }

      // Merge with existing notifications (deduplicate by ID)
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const toAdd = newNotifications.filter(n => !existingIds.has(n.id))
        const merged = [...prev, ...toAdd]

        if (import.meta.env.DEV) {
          console.log('[useNotifications] Merging:', {
            existing: prev.length,
            new: newNotifications.length,
            toAdd: toAdd.length,
            merged: merged.length,
          })
        }

        // Cleanup and save
        const cleaned = cleanupOldNotifications(merged)
        const updatedStorage = getNotificationStorage()
        updatedStorage.notifications = cleaned
        updatedStorage.lastFetchTime = Math.floor(Date.now() / 1000)
        saveNotificationStorage(updatedStorage)

        if (import.meta.env.DEV) {
          console.log('[useNotifications] Final state:', {
            cleaned: cleaned.length,
            unread: cleaned.filter(n => !n.read).length,
          })
        }

        return cleaned
      })
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      setError('Failed to load notifications')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [])

  // Store the latest fetchNotifications in a ref
  fetchNotificationsRef.current = fetchNotifications

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
    fetchNotificationsRef.current?.()

    // Set up polling
    const intervalId = setInterval(() => {
      fetchNotificationsRef.current?.()
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [user])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    fetchNotifications,
  }
}

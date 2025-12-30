import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { NostrEvent } from 'nostr-tools'
import type { ZapNotification } from '../types/notification'
import {
  getNotificationStorage,
  getZapNotificationStorage,
  saveZapNotificationStorage,
  cleanupOldZapNotifications,
} from '../lib/notification-storage'
import { generateEventLink } from '../lib/nostr'
import { getInvoiceAmount } from '../lib/zap-utils'
import { useCurrentUser } from './useCurrentUser'
import { useEventStore } from 'applesauce-react/hooks'
import { relayPool } from '@/nostr/core'
import { useReadRelays } from './useReadRelays'

const POLL_INTERVAL_MS = 150000 // 2.5 minutes

// Popular relays that typically have zap receipts
const ZAP_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol']

/**
 * Parse the zap request from a zap receipt to extract sender info
 */
function parseZapRequest(zapReceipt: NostrEvent): {
  zapperPubkey: string
  comment?: string
} | null {
  try {
    const descriptionTag = zapReceipt.tags.find(t => t[0] === 'description')
    if (!descriptionTag?.[1]) return null

    const zapRequest = JSON.parse(descriptionTag[1]) as NostrEvent
    return {
      zapperPubkey: zapRequest.pubkey,
      comment: zapRequest.content || undefined,
    }
  } catch {
    return null
  }
}

export function useZapNotifications() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const readRelays = useReadRelays()
  const [notifications, setNotifications] = useState<ZapNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFetchingRef = useRef(false)
  const fetchNotificationsRef = useRef<(() => Promise<void>) | null>(null)

  // Store relays in ref to avoid recreating callback
  const relaysRef = useRef<string[]>([])
  relaysRef.current = [...new Set([...readRelays, ...ZAP_RELAYS])]

  // Load notifications from localStorage on mount
  useEffect(() => {
    const storage = getZapNotificationStorage()
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
      const storage = getZapNotificationStorage()
      storage.notifications = updated
      saveZapNotificationStorage(storage)

      return updated
    })
  }, [])

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }))

      // Save to localStorage
      const storage = getZapNotificationStorage()
      storage.notifications = updated
      saveZapNotificationStorage(storage)

      return updated
    })
  }, [])

  // Store user pubkey and eventStore in refs to avoid recreating callback
  const userPubkeyRef = useRef<string | null>(null)
  userPubkeyRef.current = user?.pubkey || null

  const eventStoreRef = useRef(eventStore)
  eventStoreRef.current = eventStore

  const fetchNotifications = useCallback(async () => {
    const currentUserPubkey = userPubkeyRef.current
    if (!currentUserPubkey || isFetchingRef.current) return

    const notificationStorage = getNotificationStorage()
    const { lastLoginTime } = notificationStorage

    if (lastLoginTime === 0) {
      // User hasn't logged in yet, skip
      return
    }

    isFetchingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const relays = relaysRef.current

      if (relays.length === 0) {
        if (import.meta.env.DEV) {
          console.warn('[useZapNotifications] No relays configured, skipping fetch')
        }
        return
      }

      // Query for zap receipts where user is the recipient
      const filter = {
        kinds: [9735],
        '#p': [currentUserPubkey],
        since: lastLoginTime,
        limit: 100,
      }

      const zapReceipts: NostrEvent[] = []
      const seenEventIds = new Set<string>()

      await new Promise<void>(resolve => {
        let timeoutId: NodeJS.Timeout | undefined

        const subscription = relayPool.subscription(relays, [filter]).subscribe({
          next: msg => {
            if (typeof msg !== 'string' && 'kind' in msg) {
              if (seenEventIds.has(msg.id)) {
                return
              }
              seenEventIds.add(msg.id)
              zapReceipts.push(msg)
            } else if (msg === 'EOSE') {
              if (!timeoutId) {
                timeoutId = setTimeout(() => {
                  subscription.unsubscribe()
                  resolve()
                }, 1000)
              }
            }
          },
          error: err => {
            console.error('[useZapNotifications] Subscription error:', err)
            subscription.unsubscribe()
            resolve()
          },
          complete: () => {
            resolve()
          },
        })

        // Set overall timeout
        const overallTimeout = setTimeout(() => {
          subscription.unsubscribe()
          resolve()
        }, 5000)

        return () => {
          clearTimeout(overallTimeout)
          if (timeoutId) clearTimeout(timeoutId)
        }
      })

      // Process zap receipts into notifications
      const newNotifications: ZapNotification[] = []
      const seenBolt11 = new Set<string>()

      for (const zapReceipt of zapReceipts) {
        // Deduplicate by bolt11 (same invoice = same zap)
        const bolt11Tag = zapReceipt.tags.find(t => t[0] === 'bolt11')
        const bolt11 = bolt11Tag?.[1]
        if (!bolt11 || seenBolt11.has(bolt11)) {
          continue
        }
        seenBolt11.add(bolt11)

        // Extract video ID from 'e' tag
        const eTag = zapReceipt.tags.find(t => t[0] === 'e')
        if (!eTag?.[1]) {
          continue // Only notify for zaps on videos, not profile zaps
        }

        const videoId = eTag[1]

        // Parse zap request to get zapper info
        const zapRequest = parseZapRequest(zapReceipt)
        if (!zapRequest) {
          continue
        }

        // Don't notify for self-zaps
        if (zapRequest.zapperPubkey === currentUserPubkey) {
          continue
        }

        // Get zap amount
        let amount: number
        try {
          amount = getInvoiceAmount(bolt11)
        } catch {
          continue
        }

        // Fetch video metadata from eventStore
        const videoEvent = eventStoreRef.current.getEvent(videoId)
        const videoTitle = videoEvent?.tags.find(t => t[0] === 'title')?.[1]

        // Extract identifier for addressable events
        const identifier = videoEvent?.tags.find(t => t[0] === 'd')?.[1]

        // Create notification
        const notification: ZapNotification = {
          id: zapReceipt.id,
          zapperPubkey: zapRequest.zapperPubkey,
          amount,
          comment: zapRequest.comment,
          videoId,
          videoTitle,
          timestamp: zapReceipt.created_at,
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

      // Merge with existing notifications (deduplicate by ID)
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const toAdd = newNotifications.filter(n => !existingIds.has(n.id))
        const merged = [...prev, ...toAdd]

        // Cleanup and save
        const cleaned = cleanupOldZapNotifications(merged)
        const storage = getZapNotificationStorage()
        storage.notifications = cleaned
        storage.lastFetchTime = Math.floor(Date.now() / 1000)
        saveZapNotificationStorage(storage)

        return cleaned
      })
    } catch (error) {
      console.error('Failed to fetch zap notifications:', error)
      setError('Failed to load zap notifications')
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
      if (e.key === 'nostube_zap_notifications' && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue)
          setNotifications(updated.notifications)
        } catch (error) {
          console.error('Failed to sync zap notifications:', error)
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
    markAllAsRead,
    fetchNotifications,
  }
}

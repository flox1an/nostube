import { useState, useEffect, useCallback, useMemo } from 'react'
import type { VideoNotification } from '../types/notification'
import {
  getNotificationStorage,
  saveNotificationStorage,
} from '../lib/notification-storage'
import { useCurrentUser } from './useCurrentUser'

export function useNotifications() {
  const { user } = useCurrentUser()
  const [notifications, setNotifications] = useState<VideoNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load notifications from localStorage on mount
  useEffect(() => {
    const storage = getNotificationStorage()
    setNotifications(storage.notifications)
  }, [])

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length
  }, [notifications])

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      )

      // Save to localStorage
      const storage = getNotificationStorage()
      storage.notifications = updated
      saveNotificationStorage(storage)

      return updated
    })
  }, [])

  // Fetch notifications (placeholder for now)
  const fetchNotifications = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      // TODO: Implement Nostr query
      console.log('Fetching notifications...')
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    fetchNotifications,
  }
}

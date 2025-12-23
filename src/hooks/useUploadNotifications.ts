/**
 * Upload Notifications Hook
 *
 * Manages localStorage persistence for upload/transcode completion notifications.
 * Separate from video comment notifications but shown in the same notification bell.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  UploadNotification,
  UploadNotificationStorage,
  UploadNotificationType,
} from '../types/notification'

const STORAGE_KEY = 'nostube_upload_notifications'
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60

function getDefaultStorage(): UploadNotificationStorage {
  return {
    notifications: [],
    lastUpdated: Date.now(),
  }
}

function getUploadNotificationStorage(): UploadNotificationStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultStorage()
    return JSON.parse(raw) as UploadNotificationStorage
  } catch (error) {
    console.error('[useUploadNotifications] Failed to load storage:', error)
    return getDefaultStorage()
  }
}

function saveUploadNotificationStorage(storage: UploadNotificationStorage): void {
  try {
    storage.lastUpdated = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (error) {
    console.error('[useUploadNotifications] Failed to save storage:', error)
  }
}

function cleanupOldNotifications(notifications: UploadNotification[]): UploadNotification[] {
  const sevenDaysAgo = Date.now() / 1000 - SEVEN_DAYS_IN_SECONDS
  return notifications
    .filter(n => n.timestamp > sevenDaysAgo)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50) // Keep max 50 upload notifications
}

export function useUploadNotifications() {
  const [notifications, setNotifications] = useState<UploadNotification[]>(() => {
    const storage = getUploadNotificationStorage()
    return cleanupOldNotifications(storage.notifications)
  })

  // Sync with localStorage changes (cross-tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue) as UploadNotificationStorage
          setNotifications(cleanupOldNotifications(updated.notifications))
        } catch (error) {
          console.error('[useUploadNotifications] Failed to sync notifications:', error)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  // Add a new notification
  const addNotification = useCallback(
    (
      type: UploadNotificationType,
      draftId: string,
      videoTitle?: string,
      resolution?: string,
      errorMessage?: string
    ) => {
      const newNotification: UploadNotification = {
        id: `${type}-${draftId}-${Date.now()}`,
        type,
        draftId,
        videoTitle,
        timestamp: Math.floor(Date.now() / 1000),
        read: false,
        resolution,
        errorMessage,
      }

      setNotifications(prev => {
        const updated = [newNotification, ...prev]
        const cleaned = cleanupOldNotifications(updated)

        // Save to localStorage
        saveUploadNotificationStorage({ notifications: cleaned, lastUpdated: Date.now() })

        return cleaned
      })

      return newNotification
    },
    []
  )

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))

      // Save to localStorage
      saveUploadNotificationStorage({ notifications: updated, lastUpdated: Date.now() })

      return updated
    })
  }, [])

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }))

      // Save to localStorage
      saveUploadNotificationStorage({ notifications: updated, lastUpdated: Date.now() })

      return updated
    })
  }, [])

  // Remove a notification
  const removeNotification = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== notificationId)

      // Save to localStorage
      saveUploadNotificationStorage({ notifications: updated, lastUpdated: Date.now() })

      return updated
    })
  }, [])

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([])
    saveUploadNotificationStorage({ notifications: [], lastUpdated: Date.now() })
  }, [])

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  }
}

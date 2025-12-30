/**
 * All Notifications Hook
 *
 * Merges video comment notifications, upload notifications, and zap notifications
 * into a single sorted list for display in the notification dropdown.
 */

import { useMemo, useCallback } from 'react'
import type {
  Notification,
  VideoNotification,
  UploadNotification,
  ZapNotification,
} from '../types/notification'
import { useNotifications } from './useNotifications'
import { useUploadNotifications } from './useUploadNotifications'
import { useZapNotifications } from './useZapNotifications'

export interface AllNotificationsReturn {
  // Combined notifications sorted by timestamp (newest first)
  notifications: Notification[]

  // Total unread count (video + upload + zap)
  unreadCount: number

  // Loading state (from video notifications relay fetch)
  isLoading: boolean

  // Error state
  error: string | null

  // Mark a video notification as read
  markVideoNotificationAsRead: (id: string) => void

  // Mark an upload notification as read
  markUploadNotificationAsRead: (id: string) => void

  // Mark a zap notification as read
  markZapNotificationAsRead: (id: string) => void

  // Mark all notifications as read (video, upload, and zap)
  markAllAsRead: () => void

  // Add upload notification (for UploadManager to call)
  addUploadNotification: (
    type: UploadNotification['type'],
    draftId: string,
    videoTitle?: string,
    resolution?: string,
    errorMessage?: string
  ) => UploadNotification

  // Refresh video notifications from relays
  refreshVideoNotifications: () => Promise<void>

  // Refresh zap notifications from relays
  refreshZapNotifications: () => Promise<void>

  // Access individual notification arrays
  videoNotifications: VideoNotification[]
  uploadNotifications: UploadNotification[]
  zapNotifications: ZapNotification[]
}

export function useAllNotifications(): AllNotificationsReturn {
  const {
    notifications: videoNotifications,
    unreadCount: videoUnreadCount,
    isLoading: videoIsLoading,
    error: videoError,
    markAsRead: markVideoNotificationAsRead,
    markAllAsRead: markAllVideoAsRead,
    fetchNotifications: refreshVideoNotifications,
  } = useNotifications()

  const {
    notifications: uploadNotifications,
    unreadCount: uploadUnreadCount,
    addNotification: addUploadNotification,
    markAsRead: markUploadNotificationAsRead,
    markAllAsRead: markAllUploadAsRead,
  } = useUploadNotifications()

  const {
    notifications: zapNotifications,
    unreadCount: zapUnreadCount,
    isLoading: zapIsLoading,
    error: zapError,
    markAsRead: markZapNotificationAsRead,
    markAllAsRead: markAllZapAsRead,
    fetchNotifications: refreshZapNotifications,
  } = useZapNotifications()

  // Merge and sort notifications by timestamp (newest first)
  const notifications = useMemo(() => {
    const all: Notification[] = [...videoNotifications, ...uploadNotifications, ...zapNotifications]
    return all.sort((a, b) => b.timestamp - a.timestamp)
  }, [videoNotifications, uploadNotifications, zapNotifications])

  const unreadCount = videoUnreadCount + uploadUnreadCount + zapUnreadCount
  const isLoading = videoIsLoading || zapIsLoading
  const error = videoError || zapError

  // Mark all notifications as read (video, upload, and zap)
  const markAllAsRead = useCallback(() => {
    markAllVideoAsRead()
    markAllUploadAsRead()
    markAllZapAsRead()
  }, [markAllVideoAsRead, markAllUploadAsRead, markAllZapAsRead])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markVideoNotificationAsRead,
    markUploadNotificationAsRead,
    markZapNotificationAsRead,
    markAllAsRead,
    addUploadNotification,
    refreshVideoNotifications,
    refreshZapNotifications,
    videoNotifications,
    uploadNotifications,
    zapNotifications,
  }
}

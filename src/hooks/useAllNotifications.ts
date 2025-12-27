/**
 * All Notifications Hook
 *
 * Merges video comment notifications and upload notifications into a single
 * sorted list for display in the notification dropdown.
 */

import { useMemo, useCallback } from 'react'
import type { Notification, VideoNotification, UploadNotification } from '../types/notification'
import { useNotifications } from './useNotifications'
import { useUploadNotifications } from './useUploadNotifications'

export interface AllNotificationsReturn {
  // Combined notifications sorted by timestamp (newest first)
  notifications: Notification[]

  // Total unread count (video + upload)
  unreadCount: number

  // Loading state (from video notifications relay fetch)
  isLoading: boolean

  // Error state
  error: string | null

  // Mark a video notification as read
  markVideoNotificationAsRead: (id: string) => void

  // Mark an upload notification as read
  markUploadNotificationAsRead: (id: string) => void

  // Mark all notifications as read (both video and upload)
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

  // Access individual notification arrays
  videoNotifications: VideoNotification[]
  uploadNotifications: UploadNotification[]
}

export function useAllNotifications(): AllNotificationsReturn {
  const {
    notifications: videoNotifications,
    unreadCount: videoUnreadCount,
    isLoading,
    error,
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

  // Merge and sort notifications by timestamp (newest first)
  const notifications = useMemo(() => {
    const all: Notification[] = [...videoNotifications, ...uploadNotifications]
    return all.sort((a, b) => b.timestamp - a.timestamp)
  }, [videoNotifications, uploadNotifications])

  const unreadCount = videoUnreadCount + uploadUnreadCount

  // Mark all notifications as read (both video and upload)
  const markAllAsRead = useCallback(() => {
    markAllVideoAsRead()
    markAllUploadAsRead()
  }, [markAllVideoAsRead, markAllUploadAsRead])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markVideoNotificationAsRead,
    markUploadNotificationAsRead,
    markAllAsRead,
    addUploadNotification,
    refreshVideoNotifications,
    videoNotifications,
    uploadNotifications,
  }
}

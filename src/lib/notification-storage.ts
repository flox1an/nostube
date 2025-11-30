import type { NotificationStorage, VideoNotification } from '../types/notification'

const STORAGE_KEY = 'nostube_notifications'
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60

export function getNotificationStorage(): NotificationStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      }
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('Failed to parse notification storage:', error)
    return {
      lastLoginTime: 0,
      notifications: [],
      lastFetchTime: 0,
    }
  }
}

export function saveNotificationStorage(data: NotificationStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('Failed to save notification storage:', error)
  }
}

export function cleanupOldNotifications(
  notifications: VideoNotification[]
): VideoNotification[] {
  const sevenDaysAgo = Date.now() / 1000 - SEVEN_DAYS_IN_SECONDS
  return notifications
    .filter((n) => n.timestamp > sevenDaysAgo)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100)
}

export function updateLastLoginTime(): void {
  const storage = getNotificationStorage()
  storage.lastLoginTime = Math.floor(Date.now() / 1000)
  saveNotificationStorage(storage)
}

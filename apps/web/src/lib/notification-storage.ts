import type {
  NotificationStorage,
  VideoNotification,
  ZapNotificationStorage,
  ZapNotification,
} from '../types/notification'
import { PersistentCache } from './persistent-cache'

// Notification history is user data: registered for namespacing, but not cleared
// by "Clear cache".
const storage = new PersistentCache<NotificationStorage>({
  namespace: 'notifications',
  clearable: false,
})
const zapStorage = new PersistentCache<ZapNotificationStorage>({
  namespace: 'zap-notifications',
  clearable: false,
})
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60

export function getNotificationStorage(): NotificationStorage {
  try {
    const parsed = storage.getStale('current')
    if (!parsed) {
      return {
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      }
    }
    // Migrate old notifications missing notificationType
    parsed.notifications = parsed.notifications.map(n => ({
      ...n,
      notificationType: 'video' as const,
    }))
    return parsed
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
  storage.set('current', data)
}

export function cleanupOldNotifications(notifications: VideoNotification[]): VideoNotification[] {
  const sevenDaysAgo = Date.now() / 1000 - SEVEN_DAYS_IN_SECONDS
  return notifications
    .filter(n => n.timestamp > sevenDaysAgo)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100)
}

export function updateLastLoginTime(): void {
  const storage = getNotificationStorage()
  storage.lastLoginTime = Math.floor(Date.now() / 1000)
  saveNotificationStorage(storage)
}

// Zap notification storage functions
export function getZapNotificationStorage(): ZapNotificationStorage {
  try {
    const parsed = zapStorage.getStale('current')
    if (!parsed) {
      return {
        notifications: [],
        lastFetchTime: 0,
      }
    }
    // Migrate old notifications missing notificationType
    parsed.notifications = parsed.notifications.map(n => ({
      ...n,
      notificationType: 'zap' as const,
    }))
    return parsed
  } catch (error) {
    console.error('Failed to parse zap notification storage:', error)
    return {
      notifications: [],
      lastFetchTime: 0,
    }
  }
}

export function saveZapNotificationStorage(data: ZapNotificationStorage): void {
  zapStorage.set('current', data)
}

export function cleanupOldZapNotifications(notifications: ZapNotification[]): ZapNotification[] {
  const sevenDaysAgo = Date.now() / 1000 - SEVEN_DAYS_IN_SECONDS
  return notifications
    .filter(n => n.timestamp > sevenDaysAgo)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100)
}

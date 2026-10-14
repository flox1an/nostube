import { PersistentCache } from './persistent-cache'

/**
 * Dismissal state per video ID and alert type. Entries expire after 30 days,
 * which replaces the old manual cleanup sweep (it had no callers anyway).
 */

interface Dismissals {
  availability?: number // timestamp when dismissed
  transformation?: number // timestamp when dismissed
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

const cache = new PersistentCache<Dismissals>({
  namespace: 'dismissed-alerts',
  ttl: THIRTY_DAYS,
  // User preference, not a cache: "Clear cache" must not re-show dismissed alerts.
  clearable: false,
})

/**
 * Check if an alert has been dismissed for a specific video
 */
export function isAlertDismissed(
  videoId: string,
  alertType: 'availability' | 'transformation'
): boolean {
  return !!cache.get(videoId)?.[alertType]
}

/**
 * Mark an alert as dismissed for a specific video
 */
export function dismissAlert(videoId: string, alertType: 'availability' | 'transformation'): void {
  cache.set(videoId, { ...cache.getStale(videoId), [alertType]: Date.now() })
}

/**
 * Clear dismissed state for a specific video
 */
export function clearDismissedAlerts(videoId: string): void {
  cache.delete(videoId)
}

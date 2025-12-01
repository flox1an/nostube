/**
 * Utilities for managing dismissed alerts in localStorage
 * Stores dismissal state per video ID
 */

const STORAGE_KEY = 'nostube_dismissed_alerts'

interface DismissedAlerts {
  [videoId: string]: {
    availability?: number // timestamp when dismissed
    transformation?: number // timestamp when dismissed
  }
}

/**
 * Get all dismissed alerts from localStorage
 */
function getDismissedAlerts(): DismissedAlerts {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Save dismissed alerts to localStorage
 */
function saveDismissedAlerts(alerts: DismissedAlerts): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if an alert has been dismissed for a specific video
 */
export function isAlertDismissed(
  videoId: string,
  alertType: 'availability' | 'transformation'
): boolean {
  const alerts = getDismissedAlerts()
  return !!alerts[videoId]?.[alertType]
}

/**
 * Mark an alert as dismissed for a specific video
 */
export function dismissAlert(videoId: string, alertType: 'availability' | 'transformation'): void {
  const alerts = getDismissedAlerts()
  if (!alerts[videoId]) {
    alerts[videoId] = {}
  }
  alerts[videoId][alertType] = Date.now()
  saveDismissedAlerts(alerts)
}

/**
 * Clear dismissed state for a specific video
 */
export function clearDismissedAlerts(videoId: string): void {
  const alerts = getDismissedAlerts()
  delete alerts[videoId]
  saveDismissedAlerts(alerts)
}

/**
 * Clean up old dismissed alerts (older than 30 days)
 */
export function cleanupOldDismissedAlerts(): void {
  const alerts = getDismissedAlerts()
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  let hasChanges = false
  for (const [videoId, dismissals] of Object.entries(alerts)) {
    const allOld = Object.values(dismissals).every(timestamp => timestamp < thirtyDaysAgo)
    if (allOld) {
      delete alerts[videoId]
      hasChanges = true
    }
  }

  if (hasChanges) {
    saveDismissedAlerts(alerts)
  }
}

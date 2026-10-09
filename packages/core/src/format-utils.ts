/**
 * Shared formatting utilities for dates, times, and durations.
 */

/**
 * Format seconds as mm:ss or h:mm:ss for video timestamps.
 * Uses Math.floor for whole second display.
 *
 * @example
 * formatTimestamp(65) // "1:05"
 * formatTimestamp(3661) // "1:01:01"
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Format a Unix timestamp as a localized date string.
 *
 * @example
 * formatDateSimple(1704067200) // "Jan 1, 2024"
 */
export function formatDateSimple(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a Unix timestamp as a full localized date and time string.
 *
 * @example
 * formatDateTime(1704067200) // "Jan 1, 2024, 12:00 AM"
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Format duration for video length display (without flooring, for exact durations).
 * Re-exported from formatDuration.ts for convenience.
 */
export { formatDuration } from './formatDuration'

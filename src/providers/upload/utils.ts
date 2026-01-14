/**
 * Upload Manager Utilities
 *
 * Helper functions used by the upload manager provider.
 */

/**
 * Debounce helper with flush capability for Nostr sync.
 * Returns a debounced function that can be manually flushed.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): {
  (...args: Parameters<T>): void
  flush: () => void
} {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      func(...args)
      lastArgs = null
    }, wait)
  }

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    if (lastArgs) {
      func(...lastArgs)
      lastArgs = null
    }
  }

  return debounced
}

/**
 * Check if a task status is considered "active" (in progress).
 */
export function isActiveTaskStatus(
  status: string
): status is 'pending' | 'uploading' | 'mirroring' | 'transcoding' {
  return ['pending', 'uploading', 'mirroring', 'transcoding'].includes(status)
}

/**
 * Estimates remaining seconds for a transcode/upload operation.
 * Returns undefined when the estimate is unreliable (too early, too close to done,
 * or not enough elapsed time).
 */
export function estimateRemainingSeconds(
  progress: number | undefined,
  startedAt: number,
  updatedAt?: number
): number | undefined {
  if (!progress || progress <= 0.01 || progress >= 0.99) return undefined
  const now = updatedAt ?? Date.now()
  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000)
  if (elapsedSeconds < 1) return undefined
  const totalSeconds = elapsedSeconds / progress
  const remaining = Math.round(totalSeconds - elapsedSeconds)
  if (!Number.isFinite(remaining) || remaining <= 0) return undefined
  return remaining
}

/**
 * Formats a duration in seconds as "Xm Ys" or "Xs".
 */
export function formatEtaSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

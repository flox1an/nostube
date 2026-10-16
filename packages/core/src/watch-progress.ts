/** One device-local viewing position, keyed by the stable video reference (`videoRef`). */
export interface WatchProgress {
  ref: string
  time: number
  duration: number
  /** Unix milliseconds of the last position update. */
  updatedAt: number
}

/** Shorter positions are accidental taps; past the ratio the video counts as finished. */
export const MIN_PROGRESS_SECONDS = 5
export const FINISHED_RATIO = 0.95
export const MAX_PROGRESS_ENTRIES = 50
export const PROGRESS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90

const isEntry = (value: unknown): value is WatchProgress => {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.ref === 'string' &&
    entry.ref.length > 0 &&
    entry.ref.length <= 1024 &&
    typeof entry.time === 'number' &&
    typeof entry.duration === 'number' &&
    typeof entry.updatedAt === 'number' &&
    Number.isFinite(entry.time) &&
    Number.isFinite(entry.duration) &&
    Number.isFinite(entry.updatedAt)
  )
}

/** Reads stored JSON defensively: anything malformed, stale or beyond the cap is dropped. */
export function parseWatchProgress(raw: string | null, now = Date.now()): WatchProgress[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .filter(isEntry)
      .filter(entry => now - entry.updatedAt <= PROGRESS_MAX_AGE_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PROGRESS_ENTRIES)
  } catch {
    return []
  }
}

/** True when a position is worth resuming: started meaningfully, not effectively finished. */
export function isResumable(entry: Pick<WatchProgress, 'time' | 'duration'>): boolean {
  return (
    entry.duration > 0 &&
    entry.time >= MIN_PROGRESS_SECONDS &&
    entry.time < entry.duration * FINISHED_RATIO
  )
}

/** Newest first; a finished or too-short position removes the video's entry. */
export function recordWatchProgress(
  list: WatchProgress[],
  entry: Omit<WatchProgress, 'updatedAt'>,
  now = Date.now()
): WatchProgress[] {
  const others = list.filter(item => item.ref !== entry.ref)
  if (!isResumable(entry)) return others
  return [{ ...entry, time: Math.floor(entry.time), updatedAt: now }, ...others].slice(
    0,
    MAX_PROGRESS_ENTRIES
  )
}

export const forgetWatchProgress = (list: WatchProgress[], ref: string) =>
  list.filter(item => item.ref !== ref)

/** The position to start at: an explicit link time always wins over the saved one. */
export function startPosition(explicit: number | null, saved: WatchProgress | undefined): number {
  if (explicit !== null) return Math.max(0, explicit)
  return saved && isResumable(saved) ? saved.time : 0
}

import {
  getPlayPosition,
  setPlayPosition,
  type PlayPositionData,
  type PlayPositionEntry,
} from './play-position-db'

export type { PlayPositionData, PlayPositionEntry }

/**
 * Parse stored play position from a raw JSON string (legacy localStorage migration).
 * Handles both JSON format and legacy plain-number format.
 */
export function parseStoredPosition(saved: string | null): PlayPositionData | null {
  if (!saved) return null

  if (saved.startsWith('{')) {
    try {
      const data = JSON.parse(saved) as { time?: number; duration?: number }
      if (typeof data.time === 'number' && !isNaN(data.time) && data.time > 0) {
        return {
          time: data.time,
          duration: typeof data.duration === 'number' ? data.duration : 0,
        }
      }
    } catch {
      // fall through
    }
  }

  const time = parseFloat(saved)
  if (!isNaN(time) && time > 0) {
    return { time, duration: 0 }
  }

  return null
}

// L1 in-memory cache — populated on first read, invalidated on write
const playPosCache = new Map<string, PlayPositionData | null>()
let cacheVersion = 0

export function invalidatePlayPosCache(videoId?: string, pubkey?: string) {
  if (videoId && pubkey) {
    playPosCache.delete(`${pubkey}:${videoId}`)
  } else {
    playPosCache.clear()
  }
  cacheVersion++
}

export function getPlayPosCache() {
  return playPosCache
}

export function getCacheVersion() {
  return cacheVersion
}

/**
 * One-time batch migration of all existing localStorage play positions to IndexedDB.
 * Scans all keys matching `playpos:*`, migrates each entry, then removes them.
 * Safe to call multiple times — no-ops once localStorage has no more entries.
 */
export async function migrateLocalStoragePlayPositions(): Promise<void> {
  try {
    const keysToMigrate: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('playpos:')) keysToMigrate.push(key)
    }

    if (keysToMigrate.length === 0) return

    await Promise.all(
      keysToMigrate.map(async key => {
        // key format: "playpos:{pubkey}:{videoId}"
        const withoutPrefix = key.slice('playpos:'.length)
        const colonIdx = withoutPrefix.indexOf(':')
        if (colonIdx === -1) return

        const pubkey = withoutPrefix.slice(0, colonIdx)
        const videoId = withoutPrefix.slice(colonIdx + 1)
        if (!pubkey || !videoId) return

        const raw = localStorage.getItem(key)
        const parsed = parseStoredPosition(raw)
        if (parsed) {
          await setPlayPosition(pubkey, videoId, parsed)
        }
        localStorage.removeItem(key)
      })
    )
  } catch {
    // Migration is best-effort — app works fine without it
  }
}

/**
 * Read play position for a video. Checks L1 cache first, then IndexedDB.
 * Populates the cache on miss.
 */
export async function readPlayPosition(
  pubkey: string,
  videoId: string
): Promise<PlayPositionData | null> {
  const cacheKey = `${pubkey}:${videoId}`
  if (playPosCache.has(cacheKey)) {
    return playPosCache.get(cacheKey) ?? null
  }

  const data = await getPlayPosition(pubkey, videoId)
  playPosCache.set(cacheKey, data)
  return data
}

/**
 * Write play position for a video. Updates L1 cache and persists to IndexedDB.
 */
export async function writePlayPosition(
  pubkey: string,
  videoId: string,
  data: PlayPositionData
): Promise<void> {
  const cacheKey = `${pubkey}:${videoId}`
  playPosCache.set(cacheKey, data)
  cacheVersion++
  await setPlayPosition(pubkey, videoId, data)
}

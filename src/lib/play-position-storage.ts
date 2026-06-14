import { getPlayPosition, setPlayPosition, type PlayPositionData } from './play-position-db'

export type { PlayPositionData }

/**
 * Parse stored play position from a raw JSON string (legacy localStorage migration path).
 * Handles both new JSON format and legacy plain-number format.
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

  // Check localStorage for legacy entries and migrate them once
  try {
    const legacyKey = `playpos:${pubkey}:${videoId}`
    const legacyRaw = localStorage.getItem(legacyKey)
    if (legacyRaw) {
      const parsed = parseStoredPosition(legacyRaw)
      if (parsed) {
        await setPlayPosition(pubkey, videoId, parsed)
      }
      localStorage.removeItem(legacyKey)
      playPosCache.set(cacheKey, parsed)
      return parsed
    }
  } catch {
    // ignore migration errors
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

interface PlayPositionData {
  time: number
  duration: number
}

/**
 * Parse stored play position from localStorage
 * Handles both new JSON format and legacy string format
 */
export function parseStoredPosition(saved: string | null): PlayPositionData | null {
  if (!saved) return null

  // Try parsing as JSON first (new format)
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
      // Fall through to legacy parsing
    }
  }

  // Legacy format: just a number string
  const time = parseFloat(saved)
  if (!isNaN(time) && time > 0) {
    return { time, duration: 0 }
  }

  return null
}

// Cache with invalidation support
const playPosCache = new Map<string, PlayPositionData | null>()
let cacheVersion = 0

/**
 * Clear the play position cache. Call this when positions are updated.
 */
export function invalidatePlayPosCache(videoId?: string, pubkey?: string) {
  if (videoId && pubkey) {
    // Clear specific entry
    playPosCache.delete(`playpos:${pubkey}:${videoId}`)
  } else {
    // Clear all
    playPosCache.clear()
  }
  cacheVersion++
}

// Listen for storage events (updates from other tabs or same tab)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key?.startsWith('playpos:')) {
      const key = e.key
      playPosCache.delete(key)
      cacheVersion++
    }
  })
}

export function getPlayPosCache() {
  return playPosCache
}

export function getCacheVersion() {
  return cacheVersion
}
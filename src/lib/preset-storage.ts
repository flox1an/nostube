import { type NostubePreset } from '@/types/preset'

const CACHE_KEY = 'nostube_preset_cache'
const CACHE_TTL = 1000 * 60 * 60 // 1 hour
const LOAD_TIMEOUT = 10000 // 10 seconds

interface CachedPreset {
  preset: NostubePreset
  pubkey: string
  cachedAt: number
}

export interface CacheResult {
  preset: NostubePreset
  stale: boolean
}

export function getCachedPreset(expectedPubkey: string): CacheResult | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const parsed: CachedPreset = JSON.parse(cached)

    // Check if cache is for the correct pubkey
    if (parsed.pubkey !== expectedPubkey) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    // Return preset with stale flag - don't delete expired cache
    // Use stale-while-revalidate: show immediately, fetch fresh in background
    const stale = Date.now() - parsed.cachedAt > CACHE_TTL
    return { preset: parsed.preset, stale }
  } catch {
    return null
  }
}

export function setCachedPreset(preset: NostubePreset, pubkey: string) {
  try {
    const cached: CachedPreset = {
      preset,
      pubkey,
      cachedAt: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Ignore localStorage errors
  }
}

export { CACHE_KEY, CACHE_TTL, LOAD_TIMEOUT }
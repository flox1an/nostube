import { type NostubePreset } from '@nostube/core'
import { PersistentCache } from './persistent-cache'

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

// Stale-while-revalidate: the module decides staleness from `cachedAt`, so the
// cache itself is a plain namespaced kv.
const cache = new PersistentCache<CachedPreset>({ namespace: 'preset' })

export function getCachedPreset(expectedPubkey: string): CacheResult | null {
  const cached = cache.getStale('current')
  if (!cached) return null

  // Check if cache is for the correct pubkey
  if (cached.pubkey !== expectedPubkey) {
    cache.delete('current')
    return null
  }

  // Return preset with stale flag - don't delete expired cache
  // Use stale-while-revalidate: show immediately, fetch fresh in background
  const stale = Date.now() - cached.cachedAt > CACHE_TTL
  return { preset: cached.preset, stale }
}

export function setCachedPreset(preset: NostubePreset, pubkey: string) {
  cache.set('current', { preset, pubkey, cachedAt: Date.now() })
}

export function removeCachedPreset() {
  cache.delete('current')
}

export { CACHE_TTL, LOAD_TIMEOUT }

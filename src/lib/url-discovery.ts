/**
 * URL Discovery Service
 *
 * Finds alternative sources for media files by searching for NIP-94 kind 1063 events
 * on relays. These events contain file metadata including URLs where the file is hosted.
 */

import { relayPool } from '@/nostr/core'
import type { NostrEvent } from 'nostr-tools'
import { filter as rxFilter } from 'rxjs'

export interface DiscoveryOptions {
  sha256: string // File hash (x tag)
  relays: string[] // Relays to search
  timeout?: number // Search timeout (default 10s)
  maxResults?: number // Limit results (default 20)
}

export interface DiscoveredUrl {
  url: string
  serverUrl: string // Blossom server that has it
  pubkey: string // Who published the 1063
  timestamp: number
}

/**
 * Extract URL from a kind 1063 event
 */
function extractUrlFromEvent(event: NostrEvent): string | null {
  // Check for 'url' tag
  const urlTag = event.tags.find(t => t[0] === 'url')
  if (urlTag && urlTag[1]) {
    return urlTag[1]
  }
  return null
}

/**
 * Extract server URL from a full URL
 * e.g., "https://server.com/hash.mp4" -> "https://server.com"
 */
function extractServerUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return `${urlObj.protocol}//${urlObj.hostname}`
  } catch {
    return null
  }
}

/**
 * Discover alternative URLs for a file by searching kind 1063 events
 *
 * Algorithm:
 * 1. Query relays for kind 1063 events with matching `x` tag (sha256)
 * 2. Extract `url` tag from each event
 * 3. Return sorted by timestamp (newest first)
 *
 * Note: URL validation is NOT done here - that's handled by the url-validator
 */
export async function discoverUrls(options: DiscoveryOptions): Promise<DiscoveredUrl[]> {
  const { sha256, relays, timeout = 10000, maxResults = 20 } = options

  if (!sha256 || relays.length === 0) {
    return []
  }

  return new Promise(resolve => {
    const discovered: DiscoveredUrl[] = []
    const seenUrls = new Set<string>()
    let timeoutId: number | undefined

    // Create subscription to search for kind 1063 events
    const subscription = relayPool
      .subscription(relays, [
        {
          kinds: [1063], // NIP-94 File Metadata events
          '#x': [sha256], // Match file hash
          limit: maxResults,
        },
      ])
      .pipe(
        // Filter out EOSE messages
        rxFilter((msg): msg is NostrEvent => typeof msg !== 'string' && 'kind' in msg)
      )
      .subscribe({
        next: event => {
          const url = extractUrlFromEvent(event)
          if (!url || seenUrls.has(url)) {
            return
          }

          const serverUrl = extractServerUrl(url)
          if (!serverUrl) {
            return
          }

          seenUrls.add(url)
          discovered.push({
            url,
            serverUrl,
            pubkey: event.pubkey,
            timestamp: event.created_at,
          })

          // Stop if we've reached max results
          if (discovered.length >= maxResults) {
            clearTimeout(timeoutId)
            subscription.unsubscribe()
            resolve(sortByTimestamp(discovered))
          }
        },
        error: err => {
          console.error('URL discovery error:', err)
          clearTimeout(timeoutId)
          subscription.unsubscribe()
          resolve(sortByTimestamp(discovered))
        },
      })

    // Set timeout to stop searching after specified time
    timeoutId = window.setTimeout(() => {
      subscription.unsubscribe()
      resolve(sortByTimestamp(discovered))
    }, timeout)
  })
}

/**
 * Sort discovered URLs by timestamp (newest first)
 */
function sortByTimestamp(urls: DiscoveredUrl[]): DiscoveredUrl[] {
  return urls.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Discover URLs for multiple files in parallel
 * Useful for batch processing (e.g., playlist preloading)
 */
export async function discoverUrlsBatch(options: DiscoveryOptions[]): Promise<DiscoveredUrl[][]> {
  return Promise.all(options.map(discoverUrls))
}

/**
 * Cache for discovered URLs to avoid repeated relay queries
 * Key: sha256 hash, Value: { urls, timestamp }
 */
const discoveryCache = new Map<
  string,
  { urls: DiscoveredUrl[]; timestamp: number }
>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * Discover URLs with caching
 * Uses cached results if available and not expired
 */
export async function discoverUrlsWithCache(options: DiscoveryOptions): Promise<DiscoveredUrl[]> {
  const { sha256 } = options

  // Check cache first
  const cached = discoveryCache.get(sha256)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (import.meta.env.DEV) {
      console.log(`Using cached discovered URLs for ${sha256}`)
    }
    return cached.urls
  }

  // Perform discovery
  const urls = await discoverUrls(options)

  // Cache the results
  if (urls.length > 0) {
    discoveryCache.set(sha256, {
      urls,
      timestamp: Date.now(),
    })
  }

  return urls
}

/**
 * Clear the discovery cache
 */
export function clearDiscoveryCache(): void {
  discoveryCache.clear()
}

/**
 * Get cache statistics
 */
export function getDiscoveryCacheStats() {
  return {
    size: discoveryCache.size,
    entries: Array.from(discoveryCache.entries()).map(([key, value]) => ({
      sha256: key,
      urlCount: value.urls.length,
      age: Date.now() - value.timestamp,
    })),
  }
}

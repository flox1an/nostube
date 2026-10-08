import type { NostrClient } from './nostr-client'

const CACHE_PREFIX = 'nostube-embed-profile-'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const PROFILE_FETCH_TIMEOUT_MS = 5000

export interface Profile {
  picture: string | null
  displayName: string | null
  name: string | null
  nip05: string | null
}

interface CachedProfile {
  profile: Profile
  fetchedAt: number
}

/**
 * ProfileFetcher - Fetch and cache Nostr user profiles (kind 0)
 */
export class ProfileFetcher {
  private client: NostrClient

  constructor(client: NostrClient) {
    this.client = client
  }

  /**
   * Fetch profile for a given pubkey
   */
  async fetchProfile(pubkey: string, relays: string[]): Promise<Profile | null> {
    if (!pubkey || !relays || relays.length === 0) {
      return null
    }

    // Check cache first
    const cached = ProfileFetcher.getCachedProfile(pubkey)
    if (cached) {
      return cached
    }

    try {
      const profile = await this.fetchFromRelays(pubkey, relays)
      if (profile) {
        ProfileFetcher.setCachedProfile(pubkey, profile)
        return profile
      }
      return null
    } catch (error) {
      console.error('[ProfileFetcher] Fetch failed:', error)
      return null
    }
  }

  /**
   * Fetch profile event from relays
   */
  private async fetchFromRelays(pubkey: string, relays: string[]): Promise<Profile | null> {
    const subId = `profile-${Date.now()}`
    const filter = {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    }

    // Connect to relays
    const connections: WebSocket[] = []
    for (const url of relays) {
      try {
        const ws = await this.client.connectRelay(url)
        connections.push(ws)
      } catch {
        // Skip failed connections
      }
    }

    if (connections.length === 0) {
      return null
    }

    return new Promise(resolve => {
      let resolved = false
      let latestEvent: { created_at: number; content: string } | null = null
      let eoseCount = 0

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve(latestEvent ? ProfileFetcher.parseProfileMetadata(latestEvent) : null)
        }
      }, PROFILE_FETCH_TIMEOUT_MS)

      const handlers: Array<{ ws: WebSocket; handler: (e: MessageEvent) => void }> = []

      const cleanup = () => {
        handlers.forEach(({ ws, handler }) => {
          try {
            ws.send(JSON.stringify(['CLOSE', subId]))
            ws.removeEventListener('message', handler)
          } catch {
            // Ignore
          }
        })
      }

      connections.forEach(ws => {
        const handler = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data)

            if (message[0] === 'EVENT' && message[1] === subId) {
              const nostrEvent = message[2]
              if (!latestEvent || nostrEvent.created_at > latestEvent.created_at) {
                latestEvent = nostrEvent
              }
            }

            if (message[0] === 'EOSE' && message[1] === subId) {
              eoseCount++
              if (eoseCount === connections.length && !resolved) {
                resolved = true
                clearTimeout(timeout)
                cleanup()
                resolve(latestEvent ? ProfileFetcher.parseProfileMetadata(latestEvent) : null)
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.addEventListener('message', handler)
        handlers.push({ ws, handler })
        ws.send(JSON.stringify(['REQ', subId, filter]))
      })
    })
  }

  /**
   * Parse profile metadata from kind 0 event
   */
  static parseProfileMetadata(event: { content: string }): Profile {
    try {
      const content = JSON.parse(event.content)
      return {
        picture: content.picture || null,
        displayName: content.display_name || null,
        name: content.name || null,
        nip05: content.nip05 || null,
      }
    } catch {
      return { picture: null, displayName: null, name: null, nip05: null }
    }
  }

  /**
   * Get cached profile from localStorage
   */
  static getCachedProfile(pubkey: string): Profile | null {
    try {
      const key = CACHE_PREFIX + pubkey
      const cached = localStorage.getItem(key)
      if (!cached) return null

      const data: CachedProfile = JSON.parse(cached)
      if (Date.now() - data.fetchedAt > CACHE_TTL_MS) {
        localStorage.removeItem(key)
        return null
      }
      return data.profile
    } catch {
      return null
    }
  }

  /**
   * Store profile in localStorage cache
   */
  static setCachedProfile(pubkey: string, profile: Profile): void {
    try {
      const key = CACHE_PREFIX + pubkey
      const data: CachedProfile = { profile, fetchedAt: Date.now() }
      localStorage.setItem(key, JSON.stringify(data))
    } catch {
      // Ignore storage errors
    }
  }
}

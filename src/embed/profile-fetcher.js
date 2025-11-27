/**
 * ProfileFetcher - Fetch and cache Nostr user profiles (kind 0)
 *
 * Features:
 * - Fetches kind 0 events from relays
 * - LocalStorage cache with 24-hour TTL
 * - Extracts avatar (picture) and display name
 * - Silent error handling with graceful fallbacks
 */

const CACHE_PREFIX = 'nostube-embed-profile-'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const PROFILE_FETCH_TIMEOUT_MS = 5000 // 5 seconds

export class ProfileFetcher {
  /**
   * Create profile fetcher
   * @param {NostrClient} client - Nostr client instance for relay connections
   */
  constructor(client) {
    this.client = client
  }

  /**
   * Fetch profile for a given pubkey
   * Checks cache first, then fetches from relays if needed
   * @param {string} pubkey - Hex pubkey
   * @param {string[]} relays - Relay URLs to query
   * @returns {Promise<Object|null>} Profile data or null on failure
   */
  async fetchProfile(pubkey, relays) {
    if (!pubkey || !relays || relays.length === 0) {
      console.warn('[ProfileFetcher] Invalid pubkey or relays')
      return null
    }

    // Check cache first
    const cached = ProfileFetcher.getCachedProfile(pubkey)
    if (cached) {
      console.log(`[ProfileFetcher] Cache hit for ${pubkey.substring(0, 8)}...`)
      return cached
    }

    console.log(
      `[ProfileFetcher] Cache miss, fetching from relays for ${pubkey.substring(0, 8)}...`
    )

    // Fetch from relays
    try {
      const profile = await this.fetchFromRelays(pubkey, relays)
      if (profile) {
        ProfileFetcher.setCachedProfile(pubkey, profile)
        return profile
      }
      return null
    } catch (error) {
      console.error('[ProfileFetcher] Fetch failed:', error.message)
      return null
    }
  }

  /**
   * Fetch profile event from relays
   * @param {string} pubkey - Hex pubkey
   * @param {string[]} relays - Relay URLs
   * @returns {Promise<Object|null>} Parsed profile or null
   */
  async fetchFromRelays(pubkey, relays) {
    const subId = `profile-${Date.now()}`
    const filter = {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    }

    console.log('[ProfileFetcher] Fetching with filter:', filter)

    // Connect to relays
    const connectionPromises = relays.map(url =>
      this.client.connectRelay(url).catch(err => {
        console.warn(`[ProfileFetcher] Failed to connect to ${url}:`, err.message)
        return null
      })
    )

    const connections = (await Promise.all(connectionPromises)).filter(Boolean)

    if (connections.length === 0) {
      console.warn('[ProfileFetcher] Failed to connect to any relay')
      return null
    }

    console.log(`[ProfileFetcher] Connected to ${connections.length}/${relays.length} relays`)

    // Fetch profile event
    return new Promise((resolve, reject) => {
      let resolved = false
      let latestEvent = null
      let eoseCount = 0
      const totalRelays = connections.length

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.client.closeSubscription(subId)

          if (latestEvent) {
            const profile = ProfileFetcher.parseProfileMetadata(latestEvent)
            console.log('[ProfileFetcher] Timeout, returning latest profile')
            resolve(profile)
          } else {
            console.warn('[ProfileFetcher] Timeout, no profile found')
            resolve(null)
          }
        }
      }, PROFILE_FETCH_TIMEOUT_MS)

      // Subscribe to each connection
      connections.forEach(ws => {
        const messageHandler = event => {
          try {
            const message = JSON.parse(event.data)

            // Handle EVENT messages
            if (message[0] === 'EVENT' && message[1] === subId) {
              const nostrEvent = message[2]

              // Keep newest profile event
              if (!latestEvent || nostrEvent.created_at > latestEvent.created_at) {
                latestEvent = nostrEvent
                console.log(
                  `[ProfileFetcher] Profile event received (created_at: ${nostrEvent.created_at})`
                )
              }
            }

            // Handle EOSE
            if (message[0] === 'EOSE' && message[1] === subId) {
              eoseCount++
              console.log(`[ProfileFetcher] EOSE received (${eoseCount}/${totalRelays})`)

              // When all relays respond, return latest
              if (eoseCount === totalRelays && !resolved) {
                resolved = true
                clearTimeout(timeout)
                this.client.closeSubscription(subId)

                if (latestEvent) {
                  const profile = ProfileFetcher.parseProfileMetadata(latestEvent)
                  console.log('[ProfileFetcher] All relays responded, returning profile')
                  resolve(profile)
                } else {
                  console.warn('[ProfileFetcher] No profile found on any relay')
                  resolve(null)
                }
              }
            }
          } catch (error) {
            console.error('[ProfileFetcher] Failed to parse message:', error)
          }
        }

        ws.addEventListener('message', messageHandler)

        // Store subscription for cleanup
        if (!this.client.subscriptions.has(subId)) {
          this.client.subscriptions.set(subId, [])
        }
        this.client.subscriptions.get(subId).push({
          ws,
          handler: messageHandler,
        })

        // Send REQ
        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
        console.log('[ProfileFetcher] Sent REQ to relay')
      })
    })
  }

  /**
   * Parse profile metadata from kind 0 event
   * @param {Object} event - Nostr kind 0 event
   * @returns {Object} Parsed profile {picture, displayName, name}
   */
  static parseProfileMetadata(event) {
    try {
      const content = JSON.parse(event.content)

      return {
        picture: content.picture || null,
        displayName: content.display_name || null,
        name: content.name || null,
        nip05: content.nip05 || null,
        about: content.about || null,
      }
    } catch (error) {
      console.error('[ProfileFetcher] Failed to parse profile JSON:', error)
      return {
        picture: null,
        displayName: null,
        name: null,
        nip05: null,
        about: null,
      }
    }
  }

  /**
   * Get cached profile from localStorage
   * @param {string} pubkey - Hex pubkey
   * @returns {Object|null} Cached profile or null if not found/expired
   */
  static getCachedProfile(pubkey) {
    try {
      const key = CACHE_PREFIX + pubkey
      const cached = localStorage.getItem(key)

      if (!cached) {
        return null
      }

      const data = JSON.parse(cached)

      if (!ProfileFetcher.isCacheValid(data)) {
        localStorage.removeItem(key)
        return null
      }

      return data.profile
    } catch (error) {
      console.error('[ProfileFetcher] Cache read error:', error)
      return null
    }
  }

  /**
   * Store profile in localStorage cache
   * @param {string} pubkey - Hex pubkey
   * @param {Object} profile - Profile data
   */
  static setCachedProfile(pubkey, profile) {
    try {
      const key = CACHE_PREFIX + pubkey
      const data = {
        profile,
        fetchedAt: Date.now(),
      }
      localStorage.setItem(key, JSON.stringify(data))
      console.log(`[ProfileFetcher] Cached profile for ${pubkey.substring(0, 8)}...`)
    } catch (error) {
      console.error('[ProfileFetcher] Cache write error:', error)
    }
  }

  /**
   * Check if cached data is still valid
   * @param {Object} cachedData - Data from localStorage
   * @returns {boolean} True if valid, false if expired
   */
  static isCacheValid(cachedData) {
    if (!cachedData || !cachedData.fetchedAt) {
      return false
    }

    const age = Date.now() - cachedData.fetchedAt
    return age < CACHE_TTL_MS
  }
}

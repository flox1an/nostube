import { EventCache } from './event-cache.js'

/**
 * Simple Nostr relay client for fetching video events
 */
export class NostrClient {
  constructor(relays) {
    this.relays = relays
    this.connections = new Map()
    this.subscriptions = new Map()
  }

  /**
   * Connect to a single relay
   * @param {string} url - Relay WebSocket URL
   * @returns {Promise<WebSocket>}
   */
  async connectRelay(url) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout: ${url}`))
      }, 10000) // 10 second timeout

      try {
        const ws = new WebSocket(url)

        ws.onopen = () => {
          clearTimeout(timeout)
          console.log(`[Nostr Client] Connected to ${url}`)
          this.connections.set(url, ws)
          resolve(ws)
        }

        ws.onerror = error => {
          clearTimeout(timeout)
          console.error(`[Nostr Client] Connection error ${url}:`, error)
          reject(error)
        }

        ws.onclose = () => {
          console.log(`[Nostr Client] Disconnected from ${url}`)
          this.connections.delete(url)
        }
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  /**
   * Fetch a video event by ID or address
   * @param {Object} identifier - Decoded identifier {type, data}
   * @returns {Promise<Object>} - Nostr event
   */
  async fetchEvent(identifier) {
    // Generate cache key based on identifier type
    let cacheKey
    if (identifier.type === 'event') {
      cacheKey = identifier.data.id
    } else if (identifier.type === 'address') {
      cacheKey = EventCache.getAddressableKey(
        identifier.data.kind,
        identifier.data.pubkey,
        identifier.data.identifier
      )
    } else {
      throw new Error('Invalid identifier type')
    }

    // Check cache first
    const cached = EventCache.getCachedEvent(cacheKey)
    if (cached) {
      console.log(`[Nostr Client] Cache hit for event ${cacheKey.substring(0, 16)}...`)
      return cached
    }

    console.log(`[Nostr Client] Cache miss for event ${cacheKey.substring(0, 16)}...`)

    const subId = `embed-${Date.now()}`

    // Build filter based on identifier type
    let filter
    if (identifier.type === 'event') {
      filter = { ids: [identifier.data.id] }
    } else if (identifier.type === 'address') {
      filter = {
        kinds: [identifier.data.kind],
        authors: [identifier.data.pubkey],
        '#d': [identifier.data.identifier],
      }
    }

    console.log('[Nostr Client] Fetching event with filter:', filter)

    // Connect to all relays in parallel
    const connectionPromises = this.relays.map(url =>
      this.connectRelay(url).catch(err => {
        console.warn(`[Nostr Client] Failed to connect to ${url}:`, err.message)
        return null
      })
    )

    const connections = (await Promise.all(connectionPromises)).filter(Boolean)

    if (connections.length === 0) {
      throw new Error('Failed to connect to any relay')
    }

    console.log(`[Nostr Client] Connected to ${connections.length}/${this.relays.length} relays`)

    // Subscribe and wait for event
    return new Promise((resolve, reject) => {
      let resolved = false
      const isAddressable = identifier.type === 'address'
      let collectedEvents = []
      let eoseCount = 0
      const totalRelays = connections.length

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.closeSubscription(subId)

          // For addressable events, return newest if we have any
          if (isAddressable && collectedEvents.length > 0) {
            const newest = collectedEvents.reduce((prev, current) =>
              current.created_at > prev.created_at ? current : prev
            )
            console.log(
              `[Nostr Client] Returning newest addressable event (created_at: ${newest.created_at})`
            )
            // Cache the event before returning
            EventCache.setCachedEvent(cacheKey, newest)
            resolve(newest)
          } else {
            reject(new Error('Event not found (timeout)'))
          }
        }
      }, 10000) // 10 second timeout for event fetch

      // Subscribe to each connection
      connections.forEach(ws => {
        // Handle messages
        const messageHandler = event => {
          try {
            const message = JSON.parse(event.data)

            // Handle EVENT messages
            if (message[0] === 'EVENT' && message[1] === subId) {
              const nostrEvent = message[2]

              if (isAddressable) {
                // For addressable events: collect all events
                collectedEvents.push(nostrEvent)
                console.log(
                  `[Nostr Client] Addressable event received (created_at: ${nostrEvent.created_at}), total: ${collectedEvents.length}`
                )
              } else {
                // For regular events: return immediately on first match
                if (!resolved) {
                  resolved = true
                  clearTimeout(timeout)
                  console.log('[Nostr Client] Regular event received, returning immediately')
                  this.closeSubscription(subId)
                  // Cache the event before returning
                  EventCache.setCachedEvent(cacheKey, nostrEvent)
                  resolve(nostrEvent)
                }
              }
            }

            // Handle EOSE (end of stored events)
            if (message[0] === 'EOSE' && message[1] === subId) {
              eoseCount++
              console.log(`[Nostr Client] EOSE received (${eoseCount}/${totalRelays})`)

              // For addressable events: wait for all relays, then return newest
              if (isAddressable && eoseCount === totalRelays && !resolved) {
                resolved = true
                clearTimeout(timeout)
                this.closeSubscription(subId)

                if (collectedEvents.length > 0) {
                  const newest = collectedEvents.reduce((prev, current) =>
                    current.created_at > prev.created_at ? current : prev
                  )
                  console.log(
                    `[Nostr Client] All relays responded, returning newest event (created_at: ${newest.created_at})`
                  )
                  // Cache the event before returning
                  EventCache.setCachedEvent(cacheKey, newest)
                  resolve(newest)
                } else {
                  reject(new Error('Addressable event not found on any relay'))
                }
              }
            }
          } catch (error) {
            console.error('[Nostr Client] Failed to parse message:', error)
          }
        }

        ws.addEventListener('message', messageHandler)

        // Store subscription info for cleanup
        if (!this.subscriptions.has(subId)) {
          this.subscriptions.set(subId, [])
        }
        this.subscriptions.get(subId).push({
          ws,
          handler: messageHandler,
        })

        // Send REQ message
        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
        console.log(`[Nostr Client] Sent REQ to relay:`, reqMessage)
      })
    })
  }

  /**
   * Close subscription and clean up
   * @param {string} subId - Subscription ID
   */
  closeSubscription(subId) {
    const subs = this.subscriptions.get(subId)
    if (!subs) return

    // Send CLOSE message and remove event listeners
    subs.forEach(({ ws, handler }) => {
      try {
        ws.send(JSON.stringify(['CLOSE', subId]))
        ws.removeEventListener('message', handler)
      } catch (error) {
        // Ignore errors during cleanup
      }
    })

    this.subscriptions.delete(subId)
    console.log(`[Nostr Client] Closed subscription ${subId}`)
  }

  /**
   * Close all connections
   */
  closeAll() {
    // Close all subscriptions
    this.subscriptions.forEach((_, subId) => {
      this.closeSubscription(subId)
    })

    // Close all WebSocket connections
    this.connections.forEach((ws, url) => {
      try {
        ws.close()
      } catch (error) {
        // Ignore errors during cleanup
      }
    })

    this.connections.clear()
    console.log('[Nostr Client] All connections closed')
  }
}

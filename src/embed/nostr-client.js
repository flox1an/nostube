import { EventCache } from './event-cache.js'

/**
 * Simple Nostr relay client for fetching video events
 * Optimized for fast initial load with early-return strategies
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
      }, 5000) // Reduced from 10s to 5s

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
   * Optimized: subscribes as soon as each relay connects, returns early
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

    const isAddressable = identifier.type === 'address'

    return new Promise((resolve, reject) => {
      let resolved = false
      let collectedEvents = []
      let eoseCount = 0
      let connectedCount = 0
      let failedCount = 0
      const totalRelays = this.relays.length
      let earlyReturnTimer = null

      // Overall timeout - reduced from 10s to 6s
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          clearTimeout(earlyReturnTimer)
          this.closeSubscription(subId)

          if (collectedEvents.length > 0) {
            const newest = collectedEvents.reduce((prev, current) =>
              current.created_at > prev.created_at ? current : prev
            )
            console.log(
              `[Nostr Client] Timeout - returning best event (created_at: ${newest.created_at})`
            )
            EventCache.setCachedEvent(cacheKey, newest)
            resolve(newest)
          } else {
            reject(new Error('Event not found (timeout)'))
          }
        }
      }, 6000)

      // Handle message from a relay
      const handleMessage = (ws, event) => {
        if (resolved) return

        try {
          const message = JSON.parse(event.data)

          // Handle EVENT messages
          if (message[0] === 'EVENT' && message[1] === subId) {
            const nostrEvent = message[2]

            if (isAddressable) {
              // For addressable events: collect and set early return timer
              collectedEvents.push(nostrEvent)
              console.log(
                `[Nostr Client] Addressable event received (created_at: ${nostrEvent.created_at}), total: ${collectedEvents.length}`
              )

              // Start early return timer after first event (wait 200ms for potentially newer versions)
              if (!earlyReturnTimer && collectedEvents.length === 1) {
                earlyReturnTimer = setTimeout(() => {
                  if (!resolved && collectedEvents.length > 0) {
                    resolved = true
                    clearTimeout(timeout)
                    this.closeSubscription(subId)
                    const newest = collectedEvents.reduce((prev, current) =>
                      current.created_at > prev.created_at ? current : prev
                    )
                    console.log(`[Nostr Client] Early return - got event after 200ms wait`)
                    EventCache.setCachedEvent(cacheKey, newest)
                    resolve(newest)
                  }
                }, 200)
              }
            } else {
              // For regular events: return immediately on first match
              resolved = true
              clearTimeout(timeout)
              clearTimeout(earlyReturnTimer)
              console.log('[Nostr Client] Regular event received, returning immediately')
              this.closeSubscription(subId)
              EventCache.setCachedEvent(cacheKey, nostrEvent)
              resolve(nostrEvent)
            }
          }

          // Handle EOSE (end of stored events)
          if (message[0] === 'EOSE' && message[1] === subId) {
            eoseCount++
            console.log(`[Nostr Client] EOSE received (${eoseCount}/${connectedCount})`)

            // For addressable events: return after first EOSE if we have events
            if (isAddressable && !resolved) {
              if (collectedEvents.length > 0) {
                // Got events and at least one relay finished - return immediately
                // (we already have the event, no need to wait for more)
                resolved = true
                clearTimeout(timeout)
                clearTimeout(earlyReturnTimer)
                this.closeSubscription(subId)
                const newest = collectedEvents.reduce((prev, current) =>
                  current.created_at > prev.created_at ? current : prev
                )
                console.log(
                  `[Nostr Client] EOSE-triggered return with ${collectedEvents.length} events`
                )
                EventCache.setCachedEvent(cacheKey, newest)
                resolve(newest)
              } else if (eoseCount === connectedCount) {
                // All relays responded with no events
                resolved = true
                clearTimeout(timeout)
                clearTimeout(earlyReturnTimer)
                this.closeSubscription(subId)
                reject(new Error('Addressable event not found on any relay'))
              }
            }
          }
        } catch (error) {
          console.error('[Nostr Client] Failed to parse message:', error)
        }
      }

      // Subscribe to a single relay
      const subscribeToRelay = ws => {
        const messageHandler = event => handleMessage(ws, event)

        ws.addEventListener('message', messageHandler)

        // Store subscription info for cleanup
        if (!this.subscriptions.has(subId)) {
          this.subscriptions.set(subId, [])
        }
        this.subscriptions.get(subId).push({
          ws,
          handler: messageHandler,
        })

        // Send REQ message immediately
        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
        console.log(`[Nostr Client] Sent REQ to relay`)
      }

      // Connect to relays and subscribe as each connects (don't wait for all)
      this.relays.forEach(url => {
        this.connectRelay(url)
          .then(ws => {
            if (resolved) return // Already resolved, skip
            connectedCount++
            console.log(`[Nostr Client] Connected ${connectedCount}/${totalRelays}`)
            subscribeToRelay(ws)
          })
          .catch(err => {
            failedCount++
            console.warn(`[Nostr Client] Failed to connect to ${url}:`, err.message)

            // If all relays failed, reject
            if (failedCount === totalRelays && !resolved) {
              resolved = true
              clearTimeout(timeout)
              clearTimeout(earlyReturnTimer)
              reject(new Error('Failed to connect to any relay'))
            }
          })
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

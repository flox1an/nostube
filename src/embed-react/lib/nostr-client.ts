import type { NostrEvent } from 'nostr-tools'
import { EventCache } from './event-cache'
import type { DecodedIdentifier } from './nostr-decoder'

interface Subscription {
  ws: WebSocket
  handler: (event: MessageEvent) => void
}

/**
 * Simple Nostr relay client for fetching video events
 * Optimized for fast initial load with early-return strategies
 */
export class NostrClient {
  private relays: string[]
  private connections: Map<string, WebSocket> = new Map()
  private subscriptions: Map<string, Subscription[]> = new Map()

  constructor(relays: string[]) {
    this.relays = relays
  }

  /**
   * Connect to a single relay
   */
  async connectRelay(url: string): Promise<WebSocket> {
    // Return existing connection if available
    const existing = this.connections.get(url)
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout: ${url}`))
      }, 5000)

      try {
        const ws = new WebSocket(url)

        ws.onopen = () => {
          clearTimeout(timeout)
          this.connections.set(url, ws)
          resolve(ws)
        }

        ws.onerror = error => {
          clearTimeout(timeout)
          reject(error)
        }

        ws.onclose = () => {
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
   */
  async fetchEvent(identifier: DecodedIdentifier): Promise<NostrEvent> {
    // Generate cache key
    let cacheKey: string
    if (identifier.type === 'event') {
      cacheKey = identifier.data.id
    } else {
      cacheKey = EventCache.getAddressableKey(
        identifier.data.kind,
        identifier.data.pubkey,
        identifier.data.identifier
      )
    }

    // Check cache first
    const cached = EventCache.getCachedEvent(cacheKey)
    if (cached) {
      return cached
    }

    const subId = `embed-${Date.now()}`

    // Build filter
    let filter: Record<string, unknown>
    if (identifier.type === 'event') {
      filter = { ids: [identifier.data.id] }
    } else {
      filter = {
        kinds: [identifier.data.kind],
        authors: [identifier.data.pubkey],
        '#d': [identifier.data.identifier],
      }
    }

    const isAddressable = identifier.type === 'address'

    return new Promise((resolve, reject) => {
      let resolved = false
      const collectedEvents: NostrEvent[] = []
      let eoseCount = 0
      let connectedCount = 0
      let failedCount = 0
      const totalRelays = this.relays.length
      let earlyReturnTimer: ReturnType<typeof setTimeout> | null = null

      // Overall timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
          this.closeSubscription(subId)

          if (collectedEvents.length > 0) {
            const newest = collectedEvents.reduce((prev, current) =>
              current.created_at > prev.created_at ? current : prev
            )
            EventCache.setCachedEvent(cacheKey, newest)
            resolve(newest)
          } else {
            reject(new Error('Event not found (timeout)'))
          }
        }
      }, 6000)

      const handleMessage = (event: MessageEvent) => {
        if (resolved) return

        try {
          const message = JSON.parse(event.data)

          if (message[0] === 'EVENT' && message[1] === subId) {
            const nostrEvent = message[2] as NostrEvent

            if (isAddressable) {
              collectedEvents.push(nostrEvent)

              if (!earlyReturnTimer && collectedEvents.length === 1) {
                earlyReturnTimer = setTimeout(() => {
                  if (!resolved && collectedEvents.length > 0) {
                    resolved = true
                    clearTimeout(timeout)
                    this.closeSubscription(subId)
                    const newest = collectedEvents.reduce((prev, current) =>
                      current.created_at > prev.created_at ? current : prev
                    )
                    EventCache.setCachedEvent(cacheKey, newest)
                    resolve(newest)
                  }
                }, 200)
              }
            } else {
              resolved = true
              clearTimeout(timeout)
              if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
              this.closeSubscription(subId)
              EventCache.setCachedEvent(cacheKey, nostrEvent)
              resolve(nostrEvent)
            }
          }

          if (message[0] === 'EOSE' && message[1] === subId) {
            eoseCount++

            if (isAddressable && !resolved) {
              if (collectedEvents.length > 0) {
                resolved = true
                clearTimeout(timeout)
                if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
                this.closeSubscription(subId)
                const newest = collectedEvents.reduce((prev, current) =>
                  current.created_at > prev.created_at ? current : prev
                )
                EventCache.setCachedEvent(cacheKey, newest)
                resolve(newest)
              } else if (eoseCount === connectedCount) {
                resolved = true
                clearTimeout(timeout)
                if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
                this.closeSubscription(subId)
                reject(new Error('Addressable event not found on any relay'))
              }
            }
          }
        } catch (error) {
          console.error('[Nostr Client] Failed to parse message:', error)
        }
      }

      const subscribeToRelay = (ws: WebSocket) => {
        ws.addEventListener('message', handleMessage)

        if (!this.subscriptions.has(subId)) {
          this.subscriptions.set(subId, [])
        }
        this.subscriptions.get(subId)!.push({ ws, handler: handleMessage })

        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
      }

      this.relays.forEach(url => {
        this.connectRelay(url)
          .then(ws => {
            if (resolved) return
            connectedCount++
            subscribeToRelay(ws)
          })
          .catch(() => {
            failedCount++
            if (failedCount === totalRelays && !resolved) {
              resolved = true
              clearTimeout(timeout)
              if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
              reject(new Error('Failed to connect to any relay'))
            }
          })
      })
    })
  }

  /**
   * Close subscription and clean up
   */
  closeSubscription(subId: string): void {
    const subs = this.subscriptions.get(subId)
    if (!subs) return

    subs.forEach(({ ws, handler }) => {
      try {
        ws.send(JSON.stringify(['CLOSE', subId]))
        ws.removeEventListener('message', handler)
      } catch {
        // Ignore errors during cleanup
      }
    })

    this.subscriptions.delete(subId)
  }

  /**
   * Fetch blossom servers (kind 10063) for a pubkey
   */
  async fetchBlossomServers(pubkey: string): Promise<string[]> {
    const subId = `blossom-${Date.now()}`
    const filter = {
      kinds: [10063],
      authors: [pubkey],
    }

    return new Promise(resolve => {
      let resolved = false
      let latestEvent: NostrEvent | null = null
      let eoseCount = 0
      let connectedCount = 0

      // Timeout - return whatever we have after 3 seconds
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.closeSubscription(subId)
          resolve(extractBlossomUrls(latestEvent))
        }
      }, 3000)

      const handleMessage = (event: MessageEvent) => {
        if (resolved) return

        try {
          const message = JSON.parse(event.data)

          if (message[0] === 'EVENT' && message[1] === subId) {
            const nostrEvent = message[2] as NostrEvent
            // Keep the most recent event
            if (!latestEvent || nostrEvent.created_at > latestEvent.created_at) {
              latestEvent = nostrEvent
            }
          }

          if (message[0] === 'EOSE' && message[1] === subId) {
            eoseCount++
            // If we've heard from all connected relays, resolve
            if (eoseCount >= connectedCount && connectedCount > 0) {
              resolved = true
              clearTimeout(timeout)
              this.closeSubscription(subId)
              resolve(extractBlossomUrls(latestEvent))
            }
          }
        } catch (error) {
          console.error('[Nostr Client] Failed to parse blossom message:', error)
        }
      }

      const subscribeToRelay = (ws: WebSocket) => {
        ws.addEventListener('message', handleMessage)

        if (!this.subscriptions.has(subId)) {
          this.subscriptions.set(subId, [])
        }
        this.subscriptions.get(subId)!.push({ ws, handler: handleMessage })

        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
      }

      // Connect to relays
      this.relays.forEach(url => {
        this.connectRelay(url)
          .then(ws => {
            if (resolved) return
            connectedCount++
            subscribeToRelay(ws)
          })
          .catch(() => {
            // Ignore connection failures for blossom lookup
          })
      })

      // If no relays connect within 1 second, resolve with empty
      setTimeout(() => {
        if (connectedCount === 0 && !resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve([])
        }
      }, 1000)
    })
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.subscriptions.forEach((_, subId) => {
      this.closeSubscription(subId)
    })

    this.connections.forEach(ws => {
      try {
        ws.close()
      } catch {
        // Ignore errors during cleanup
      }
    })

    this.connections.clear()
  }
}

/**
 * Extract blossom server URLs from a kind 10063 event
 */
function extractBlossomUrls(event: NostrEvent | null): string[] {
  if (!event) return []

  const urls: string[] = []
  for (const tag of event.tags) {
    if (tag[0] === 'server' && tag[1]) {
      try {
        // Validate it's a proper URL
        const url = new URL(tag[1])
        urls.push(url.toString().replace(/\/$/, '')) // Normalize URL
      } catch {
        // Invalid URL, skip
      }
    }
  }
  return urls
}

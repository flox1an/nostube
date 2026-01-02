import { useState, useEffect } from 'react'
import { useAppContext } from './useAppContext'
import { relayPool } from '@/nostr/core'

// NIP-89 handler info kind
const HANDLER_INFO_KIND = 31990

/**
 * Hook to check if a video transform DVM is available
 * Queries for NIP-89 handler announcements
 */
export function useDvmAvailability(): {
  isAvailable: boolean | null // null = still checking
  isLoading: boolean
} {
  const { config } = useAppContext()
  const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
  const hasRelays = readRelays.length > 0

  const [isAvailable, setIsAvailable] = useState<boolean | null>(() => (hasRelays ? null : false))
  const [isLoading, setIsLoading] = useState(() => hasRelays)

  useEffect(() => {
    if (!hasRelays) {
      if (import.meta.env.DEV) {
        console.log('[DVM Availability] No read relays configured')
      }
      return
    }

    let resolved = false

    if (import.meta.env.DEV) {
      console.log('[DVM Availability] Checking for DVM on relays:', readRelays)
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        sub.unsubscribe()
        if (import.meta.env.DEV) {
          console.log('[DVM Availability] Timeout - no DVM found within 5s')
        }
        setIsAvailable(false)
        setIsLoading(false)
      }
    }, 5000) // 5 second timeout for availability check

    const sub = relayPool
      .request(readRelays, [
        {
          kinds: [HANDLER_INFO_KIND],
          '#k': ['5207'],
          '#d': ['video-transform-hls'],
          limit: 1,
        },
      ])
      .subscribe({
        next: event => {
          if (typeof event === 'string') {
            if (import.meta.env.DEV) {
              console.log('[DVM Availability] EOSE received')
            }
            return // EOSE
          }
          if (resolved) return

          // Found a handler
          if (import.meta.env.DEV) {
            console.log('[DVM Availability] Found DVM handler:', event)
          }
          resolved = true
          clearTimeout(timeout)
          sub.unsubscribe()
          setIsAvailable(true)
          setIsLoading(false)
        },
        error: err => {
          if (import.meta.env.DEV) {
            console.log('[DVM Availability] Error:', err)
          }
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            setIsAvailable(false)
            setIsLoading(false)
          }
        },
        complete: () => {
          // No handler found
          if (import.meta.env.DEV) {
            console.log('[DVM Availability] Subscription completed - no DVM found')
          }
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            setIsAvailable(false)
            setIsLoading(false)
          }
        },
      })

    return () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        sub.unsubscribe()
      }
    }
  }, [hasRelays, readRelays])

  return { isAvailable, isLoading }
}

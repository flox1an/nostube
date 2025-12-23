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
      return
    }

    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        sub.unsubscribe()
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
          if (typeof event === 'string') return // EOSE
          if (resolved) return

          // Found a handler
          resolved = true
          clearTimeout(timeout)
          sub.unsubscribe()
          setIsAvailable(true)
          setIsLoading(false)
        },
        error: () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            setIsAvailable(false)
            setIsLoading(false)
          }
        },
        complete: () => {
          // No handler found
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

import { useState, useEffect, useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { DEFAULT_RELAYS, relayPool } from '@/nostr/core'
import { type NostrEvent } from 'nostr-tools'

/**
 * Hook to check if a video transform DVM is available
 * Queries for NIP-89 handler announcements
 */
export function useDvmAvailability(): {
  isAvailable: boolean | null // null = still checking
  isLoading: boolean
} {
  const { config, relayOverride } = useAppContext()

  const dvmRelays = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const combined = new Set([...readRelays, ...writeRelays, ...DEFAULT_RELAYS])
    if (relayOverride) combined.add(relayOverride)
    return Array.from(combined)
  }, [config.relays, relayOverride])

  const hasRelays = dvmRelays.length > 0

  const [isAvailable, setIsAvailable] = useState<boolean | null>(() => (hasRelays ? null : false))
  const [isLoading, setIsLoading] = useState(() => hasRelays)

  useEffect(() => {
    if (!hasRelays) {
      if (import.meta.env.DEV) {
        console.log('[DVM Availability] No relays configured')
      }
      return
    }

    let resolved = false

    if (import.meta.env.DEV) {
      console.log('[DVM Availability] Checking for DVM on relays:', dvmRelays)
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
      .request(dvmRelays, [
        {
          kinds: [31990],
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
            console.log('[DVM Availability] Found DVM handler event:', {
              id: (event as NostrEvent).id,
              pubkey: (event as NostrEvent).pubkey,
              content: (event as NostrEvent).content,
              tags: (event as NostrEvent).tags,
            })
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
  }, [hasRelays, dvmRelays])

  return { isAvailable, isLoading }
}

import { useMemo, useEffect, useState } from 'react'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { getInvoiceAmount } from '@/lib/zap-utils'
import { useAppContext } from '@/hooks/useAppContext'
import type { NostrEvent } from 'nostr-tools'

// Popular relays that typically have zap receipts
const ZAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
]

const ZAP_CACHE_KEY = 'zap-totals-cache'
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

interface ZapCacheEntry {
  totalSats: number
  zapCount: number
  timestamp: number
}

// In-memory cache backed by localStorage
const zapCache = new Map<string, ZapCacheEntry>()

function loadCache() {
  try {
    const stored = localStorage.getItem(ZAP_CACHE_KEY)
    if (stored) {
      const data = JSON.parse(stored) as Record<string, ZapCacheEntry>
      const now = Date.now()
      // Only load non-expired entries
      for (const [key, entry] of Object.entries(data)) {
        if (now - entry.timestamp < CACHE_TTL) {
          zapCache.set(key, entry)
        }
      }
    }
  } catch {
    // Ignore cache errors
  }
}

function saveCache() {
  try {
    const data: Record<string, ZapCacheEntry> = {}
    zapCache.forEach((entry, key) => {
      data[key] = entry
    })
    localStorage.setItem(ZAP_CACHE_KEY, JSON.stringify(data))
  } catch {
    // Ignore cache errors
  }
}

function getCached(eventId: string): ZapCacheEntry | null {
  const entry = zapCache.get(eventId)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry
  }
  return null
}

function setCache(eventId: string, totalSats: number, zapCount: number) {
  zapCache.set(eventId, { totalSats, zapCount, timestamp: Date.now() })
  saveCache()
}

// Load cache on module init
loadCache()

interface UseVideoZapsReturn {
  totalSats: number
  zapCount: number
  zaps: NostrEvent[]
  isLoading: boolean
}

export function useVideoZaps(eventId: string, authorPubkey: string): UseVideoZapsReturn {
  const eventStore = useEventStore()
  const { pool } = useAppContext()

  // Get cached value immediately
  const [cachedValue] = useState(() => getCached(eventId))

  // Fetch zap receipts from relays using subscription (keeps listening for new zaps)
  useEffect(() => {
    if (!eventId) return

    const filter = {
      kinds: [9735],
      '#e': [eventId],
    }

    // Use subscription to keep listening for new zap receipts
    const sub = pool.subscription(ZAP_RELAYS, [filter]).subscribe({
      next: event => {
        if (typeof event !== 'string' && 'kind' in event) {
          eventStore.add(event)
        }
      },
      error: err => console.error('Error fetching zaps:', err),
    })

    return () => sub.unsubscribe()
  }, [eventId, pool, eventStore])

  // Subscribe to zap receipts (kind 9735) for this event from the store
  const zaps = useObservableMemo(() => {
    const filter = {
      kinds: [9735],
      '#e': [eventId],
    }

    return eventStore.timeline(filter)
  }, [eventStore, eventId])

  // Calculate total sats from zap receipts
  const { totalSats, zapCount } = useMemo(() => {
    if (!zaps || zaps.length === 0) {
      return { totalSats: 0, zapCount: 0 }
    }

    let total = 0
    const seenPayments = new Set<string>()

    for (const zap of zaps) {
      // Get bolt11 from tags
      const bolt11Tag = zap.tags.find(t => t[0] === 'bolt11')
      const bolt11 = bolt11Tag?.[1]

      if (bolt11 && !seenPayments.has(bolt11)) {
        seenPayments.add(bolt11)
        try {
          const amount = getInvoiceAmount(bolt11)
          total += amount
        } catch {
          // Invalid bolt11, skip
        }
      }
    }

    return { totalSats: total, zapCount: seenPayments.size }
  }, [zaps])

  // Update cache when we have fresh data
  useEffect(() => {
    if (eventId && (totalSats > 0 || zapCount > 0)) {
      setCache(eventId, totalSats, zapCount)
    }
  }, [eventId, totalSats, zapCount])

  // Note: authorPubkey is included for potential future filtering
  void authorPubkey

  // Return cached value if no fresh data yet, otherwise return fresh data
  const hasLiveData = zaps && zaps.length > 0
  const displaySats = hasLiveData ? totalSats : (cachedValue?.totalSats ?? 0)
  const displayCount = hasLiveData ? zapCount : (cachedValue?.zapCount ?? 0)

  return {
    totalSats: displaySats,
    zapCount: displayCount,
    zaps: zaps || [],
    isLoading: !zaps,
  }
}

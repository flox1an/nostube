import { useMemo, useEffect, useState } from 'react'
import { useEventStore, use$, useEventModel } from 'applesauce-react/hooks'
import { ReactionsModel } from 'applesauce-common/models'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { getInvoiceAmount } from '@/lib/zap-utils'
import { useAppContext } from '@/hooks/useAppContext'
import { createReactionsLoader } from 'applesauce-loaders/loaders'
import { combineRelays } from '@/lib/utils'
import type { NostrEvent } from 'nostr-tools'

// Popular relays that typically have zap receipts
const ZAP_RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol']

/** NIP-25: A reaction with content '-' is a downvote. Everything else ('+', emoji, custom text) is an upvote. */
export const isUpvoteReaction = (content: string) => content !== '-'
export const isDownvoteReaction = (content: string) => content === '-'

const STATS_CACHE_KEY = 'event-stats-cache'
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

interface StatsCacheEntry {
  totalSats: number
  zapCount: number
  upvoteCount: number
  downvoteCount: number
  timestamp: number
}

// In-memory cache backed by localStorage
const statsCache = new Map<string, StatsCacheEntry>()

function loadCache() {
  try {
    const stored = localStorage.getItem(STATS_CACHE_KEY)
    if (stored) {
      const data = JSON.parse(stored) as Record<string, StatsCacheEntry>
      const now = Date.now()
      // Only load non-expired entries
      for (const [key, entry] of Object.entries(data)) {
        if (now - entry.timestamp < CACHE_TTL) {
          statsCache.set(key, entry)
        }
      }
    }
  } catch {
    // Ignore cache errors
  }
}

function saveCache() {
  try {
    const data: Record<string, StatsCacheEntry> = {}
    statsCache.forEach((entry, key) => {
      data[key] = entry
    })
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data))
  } catch {
    // Ignore cache errors
  }
}

function getCached(eventId: string): StatsCacheEntry | null {
  const entry = statsCache.get(eventId)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry
  }
  return null
}

function setCache(
  eventId: string,
  totalSats: number,
  zapCount: number,
  upvoteCount: number,
  downvoteCount: number
) {
  statsCache.set(eventId, {
    totalSats,
    zapCount,
    upvoteCount,
    downvoteCount,
    timestamp: Date.now(),
  })
  saveCache()
}

// Load cache on module init
loadCache()

interface UseEventStatsOptions {
  eventId: string
  authorPubkey: string
  kind: number
  relays?: string[]
  identifier?: string // d-tag for addressable events (kinds 34235, 34236)
}

interface UseEventStatsReturn {
  totalSats: number
  zapCount: number
  upvoteCount: number
  downvoteCount: number
  hasUpvoted: boolean
  hasDownvoted: boolean
  zaps: NostrEvent[]
  reactions: NostrEvent[]
  isLoading: boolean
}

/**
 * Unified hook for event statistics (zaps + reactions) with caching.
 * Shows cached values immediately, fetches fresh data in background.
 */
export function useEventStats({
  eventId,
  authorPubkey,
  kind,
  relays = [],
  identifier,
}: UseEventStatsOptions): UseEventStatsReturn {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()

  // Get cached value immediately
  const [cachedValue] = useState(() => getCached(eventId))

  // Build address for addressable events (kinds 34235, 34236)
  const isAddressable = kind === 34235 || kind === 34236
  const videoAddress = useMemo(() => {
    if (isAddressable && identifier) {
      return `${kind}:${authorPubkey}:${identifier}`
    }
    return null
  }, [isAddressable, kind, authorPubkey, identifier])

  // Get stored event for seenRelays
  const storedEvent = useMemo(() => eventStore.getEvent(eventId), [eventStore, eventId])

  const seenRelayList = useMemo(() => {
    if (!storedEvent) return []
    const relaysSet = getSeenRelays(storedEvent)
    return relaysSet ? Array.from(relaysSet) : []
  }, [storedEvent])

  // Create a fallback event for ReactionsModel
  const fallbackEvent: NostrEvent = useMemo(
    () => ({
      id: eventId,
      pubkey: authorPubkey,
      created_at: 0,
      kind,
      tags: [],
      content: '',
      sig: '',
    }),
    [eventId, authorPubkey, kind]
  )

  const targetEvent = storedEvent ?? fallbackEvent

  // Combine relays
  const relaysToUse = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    return combineRelays([relays, seenRelayList, readRelays])
  }, [relays, seenRelayList, config.relays])

  // ============ ZAP LOADING ============

  // Fetch zap receipts from relays
  // Query by both #e (event ID) and #a (address) for addressable events
  useEffect(() => {
    if (!eventId) return

    // Build filters for both event ID and address (for addressable events)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters: any[] = [{ kinds: [9735], '#e': [eventId] }]

    // For addressable events, also query by address
    if (videoAddress) {
      filters.push({ kinds: [9735], '#a': [videoAddress] })
    }

    const sub = pool.subscription(ZAP_RELAYS, filters).subscribe({
      next: event => {
        if (typeof event !== 'string' && 'kind' in event) {
          eventStore.add(event)
        }
      },
      error: err => console.error('Error fetching zaps:', err),
    })

    return () => sub.unsubscribe()
  }, [eventId, videoAddress, pool, eventStore])

  // Subscribe to zap receipts from store
  // Query by both #e and #a for addressable events
  const zapsByEventId = use$(
    () =>
      eventStore.timeline({
        kinds: [9735],
        '#e': [eventId],
      }),
    [eventStore, eventId]
  )

  const zapsByAddress = use$(
    () =>
      videoAddress
        ? eventStore.timeline({
            kinds: [9735],
            '#a': [videoAddress],
          })
        : undefined,
    [eventStore, videoAddress]
  )

  // Merge and deduplicate zaps from both queries
  const zaps = useMemo(() => {
    const byId = zapsByEventId || []
    const byAddress = zapsByAddress || []
    const seen = new Set<string>()
    const merged: NostrEvent[] = []

    for (const zap of [...byId, ...byAddress]) {
      if (!seen.has(zap.id)) {
        seen.add(zap.id)
        merged.push(zap)
      }
    }

    return merged
  }, [zapsByEventId, zapsByAddress])

  // Calculate zap totals
  const { totalSats, zapCount } = useMemo(() => {
    if (!zaps || zaps.length === 0) {
      return { totalSats: 0, zapCount: 0 }
    }

    let total = 0
    const seenPayments = new Set<string>()

    for (const zap of zaps) {
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

  // ============ REACTION LOADING ============

  // Get reactions from EventStore via ReactionsModel
  const reactions = useEventModel(ReactionsModel, [targetEvent]) || []

  // Load reactions from relays
  useEffect(() => {
    if (!eventId || relaysToUse.length === 0) return

    const loader = createReactionsLoader(pool, {
      eventStore,
      useSeenRelays: true,
    })

    const subscription = loader(targetEvent, relaysToUse).subscribe({
      next: () => {
        // Reactions are automatically added to EventStore
      },
      error: err => {
        console.error('Error loading reactions:', err)
      },
    })

    return () => subscription.unsubscribe()
  }, [eventId, pool, eventStore, targetEvent, relaysToUse])

  // Calculate reaction counts (deduplicated by user)
  const { upvoteCount, downvoteCount } = useMemo(() => {
    const upvoters = new Set<string>()
    const downvoters = new Set<string>()

    for (const reaction of reactions) {
      if (isDownvoteReaction(reaction.content)) {
        downvoters.add(reaction.pubkey)
      } else {
        upvoters.add(reaction.pubkey)
      }
    }

    return { upvoteCount: upvoters.size, downvoteCount: downvoters.size }
  }, [reactions])

  // ============ CACHE UPDATE ============

  // Update cache when we have fresh data
  useEffect(() => {
    const hasData = totalSats > 0 || zapCount > 0 || upvoteCount > 0 || downvoteCount > 0
    if (eventId && hasData) {
      setCache(eventId, totalSats, zapCount, upvoteCount, downvoteCount)
    }
  }, [eventId, totalSats, zapCount, upvoteCount, downvoteCount])

  // ============ RETURN VALUES ============

  // Determine if we have live data
  const hasLiveZaps = zaps && zaps.length > 0
  const hasLiveReactions = reactions && reactions.length > 0
  const hasLiveData = hasLiveZaps || hasLiveReactions

  // Use cached values if no live data yet
  const displaySats = hasLiveZaps ? totalSats : (cachedValue?.totalSats ?? 0)
  const displayZapCount = hasLiveZaps ? zapCount : (cachedValue?.zapCount ?? 0)
  const displayUpvotes = hasLiveReactions ? upvoteCount : (cachedValue?.upvoteCount ?? 0)
  const displayDownvotes = hasLiveReactions ? downvoteCount : (cachedValue?.downvoteCount ?? 0)

  return {
    totalSats: displaySats,
    zapCount: displayZapCount,
    upvoteCount: displayUpvotes,
    downvoteCount: displayDownvotes,
    hasUpvoted: false, // Computed in component with user context
    hasDownvoted: false, // Computed in component with user context
    zaps: zaps || [],
    reactions: reactions || [],
    isLoading: !hasLiveData && !cachedValue,
  }
}

/**
 * Helper hook to check if current user has reacted
 */
export function useUserReactionStatus(
  reactions: NostrEvent[],
  userPubkey: string | undefined
): { hasUpvoted: boolean; hasDownvoted: boolean } {
  return useMemo(() => {
    if (!userPubkey) return { hasUpvoted: false, hasDownvoted: false }

    let hasUpvoted = false
    let hasDownvoted = false

    for (const reaction of reactions) {
      if (reaction.pubkey === userPubkey) {
        if (isDownvoteReaction(reaction.content)) hasDownvoted = true
        else hasUpvoted = true
      }
    }

    return { hasUpvoted, hasDownvoted }
  }, [reactions, userPubkey])
}

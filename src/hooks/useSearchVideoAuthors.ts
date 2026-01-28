import { useState, useEffect, useMemo, useRef } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { getProfileContent, type ProfileContent } from 'applesauce-core/helpers'
import { PrimalCache } from 'applesauce-extra'
import { useReadRelays } from '@/hooks'
import { type NostrEvent } from 'nostr-tools'
import { relayPool } from '@/nostr/core'

// Search configuration
const SEARCH_LIMIT = 1000 // Max events to load from relays
const VIDEO_KINDS = [21, 22, 34235, 34236]

export interface ProfileResult {
  pubkey: string
  profile: ProfileContent
  event: NostrEvent
}

// Track video authors - shared across hook instances
const authorVideoCount = new Map<string, number>()

interface UseSearchVideoAuthorsOptions {
  /** Search query string */
  query: string
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number
  /** Max results to return (default: 10) */
  limit?: number
}

/**
 * Hook for searching authors who have uploaded videos using a hybrid approach.
 *
 * Approach:
 * 1. Quick search: Use Primal API for immediate profile results (fast)
 * 2. Filter results: Only show profiles of authors who have uploaded videos
 * 3. Background indexing: Build index of video authors for comprehensive filtering
 *
 * @example
 * const { profiles, loading } = useSearchVideoAuthors({ query: 'bitcoin' })
 */
export function useSearchVideoAuthors({
  query,
  debounceMs = 300,
  limit = 10,
}: UseSearchVideoAuthorsOptions): {
  profiles: ProfileResult[]
  loading: boolean
} {
  const eventStore = useEventStore()
  const readRelays = useReadRelays()
  const [loading, setLoading] = useState(false)
  const [primalResults, setPrimalResults] = useState<ProfileResult[]>([])
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)
  const hasFetchedRef = useRef(false)
  const abortRef = useRef(false)

  // Create PrimalCache instance - memoized to avoid reconnections
  const primal = useMemo(() => new PrimalCache(), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      primal.close()
      subscriptionRef.current?.unsubscribe()
    }
  }, [primal])

  // Debounced query
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [query, debounceMs])

  // Initial tracking: Count videos from events already in IEventStore
  useEffect(() => {
    const storeEvents: NostrEvent[] = []
    const timeline = eventStore.timeline({ kinds: VIDEO_KINDS })

    // Subscribe briefly to get current events
    const sub = timeline.subscribe({
      next: events => {
        if (events && events.length > 0) {
          storeEvents.push(...events)
        }
      },
    })

    // Unsubscribe after getting initial batch
    queueMicrotask(() => {
      sub.unsubscribe()

      if (storeEvents.length > 0) {
        // Count videos per author
        for (const event of storeEvents) {
          authorVideoCount.set(event.pubkey, (authorVideoCount.get(event.pubkey) || 0) + 1)
        }
      }
    })
  }, [eventStore])

  // Fetch video events from relays to track video authors (background, one-time)
  useEffect(() => {
    if (hasFetchedRef.current) return
    if (readRelays.length === 0) return

    hasFetchedRef.current = true

    const filters = [{ kinds: VIDEO_KINDS, limit: SEARCH_LIMIT }]

    if (import.meta.env.DEV) {
      console.log('🔍 Fetching video events to track video authors')
    }

    const loader = createTimelineLoader(relayPool, readRelays, filters, { eventStore })

    // Set a timeout to complete background indexing
    const timeoutId = setTimeout(() => {
      subscriptionRef.current?.unsubscribe()
      if (import.meta.env.DEV) {
        console.log(`🔍 Author tracking timeout. Tracked ${authorVideoCount.size} authors`)
      }
    }, 10000) // 10 second timeout

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        // Add to IEventStore
        eventStore.add(event)

        // Track video count per author
        authorVideoCount.set(event.pubkey, (authorVideoCount.get(event.pubkey) || 0) + 1)
      },
      complete: () => {
        clearTimeout(timeoutId)

        if (import.meta.env.DEV) {
          console.log(`🔍 Author tracking complete. Tracked ${authorVideoCount.size} authors`)
        }
      },
      error: err => {
        clearTimeout(timeoutId)
        console.error('Error fetching videos for author tracking:', err)
      },
    })

    subscriptionRef.current = subscription

    return () => {
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [readRelays, eventStore])

  // Perform quick Primal search when query changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim()

    if (!trimmed || trimmed.length < 2) {
      queueMicrotask(() => {
        setPrimalResults([])
        setLoading(false)
      })
      return
    }

    abortRef.current = false
    queueMicrotask(() => {
      setLoading(true)
    })

    const doSearch = async () => {
      try {
        if (import.meta.env.DEV) {
          console.log('🔍 Quick search profiles on Primal:', trimmed)
        }

        // PrimalCache.userSearch returns kind 0 profile events
        const events = await primal.userSearch(trimmed)

        if (abortRef.current) return

        // Process results
        const results: ProfileResult[] = []
        for (const event of events.slice(0, limit * 3)) {
          // Get more results to filter
          eventStore.add(event)
          const profile = getProfileContent(event)
          if (profile) {
            results.push({
              pubkey: event.pubkey,
              profile,
              event,
            })
          }
        }

        setPrimalResults(results)
      } catch (err) {
        console.error('Error searching profiles:', err)
        if (!abortRef.current) {
          setPrimalResults([])
        }
      } finally {
        if (!abortRef.current) {
          setLoading(false)
        }
      }
    }

    doSearch()

    return () => {
      abortRef.current = true
    }
  }, [debouncedQuery, eventStore, primal, limit])

  // Filter Primal results to only show video authors
  const profiles = useMemo(() => {
    if (primalResults.length === 0) return []

    // Filter to only authors who have videos
    const filteredResults = primalResults.filter(result => {
      return authorVideoCount.has(result.pubkey)
    })

    // Sort by video count descending (authors with more videos first)
    const sorted = filteredResults.sort((a, b) => {
      const aCount = authorVideoCount.get(a.pubkey) || 0
      const bCount = authorVideoCount.get(b.pubkey) || 0
      return bCount - aCount
    })

    return sorted.slice(0, limit)
  }, [primalResults, limit])

  return {
    profiles,
    loading,
  }
}

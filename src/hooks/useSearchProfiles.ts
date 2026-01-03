import { useState, useEffect, useMemo, useRef } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { getProfileContent, type ProfileContent } from 'applesauce-core/helpers'
import { PrimalCache } from 'applesauce-extra'
import { type NostrEvent } from 'nostr-tools'

export interface ProfileResult {
  pubkey: string
  profile: ProfileContent
  event: NostrEvent
}

interface UseSearchProfilesOptions {
  /** Search query string */
  query: string
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number
  /** Max results to return (default: 10) */
  limit?: number
}

/**
 * Hook for searching user profiles using Primal's user search API.
 *
 * @example
 * const { profiles, loading } = useSearchProfiles({ query: 'fiatjaf' })
 */
export function useSearchProfiles({
  query,
  debounceMs = 300,
  limit = 10,
}: UseSearchProfilesOptions): {
  profiles: ProfileResult[]
  loading: boolean
} {
  const eventStore = useEventStore()
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState<ProfileResult[]>([])
  const abortRef = useRef(false)

  // Create PrimalCache instance - memoized to avoid reconnections
  const primal = useMemo(() => new PrimalCache(), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      primal.close()
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

  // Perform search
  useEffect(() => {
    const trimmed = debouncedQuery.trim()

    if (!trimmed || trimmed.length < 2) {
      queueMicrotask(() => {
        setProfiles([])
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
          console.log('🔍 Searching profiles on Primal:', trimmed)
        }

        // PrimalCache.userSearch returns kind 0 profile events
        const events = await primal.userSearch(trimmed)

        if (abortRef.current) return

        // Process results
        const results: ProfileResult[] = []
        for (const event of events.slice(0, limit)) {
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

        setProfiles(results)
      } catch (err) {
        console.error('Error searching profiles:', err)
        if (!abortRef.current) {
          setProfiles([])
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

  return {
    profiles,
    loading,
  }
}

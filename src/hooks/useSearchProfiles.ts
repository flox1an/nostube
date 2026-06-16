import { useState, useEffect, useRef, useMemo } from 'react'
import type { ProfileContent } from 'applesauce-core/helpers'
import { getProfileContent } from 'applesauce-core/helpers'
import type { NostrEvent } from 'nostr-tools'
import { PrimalCache } from 'applesauce-extra'
import { useEventStore } from 'applesauce-react/hooks'
import { fetchPeopleResults, SEARCH_SERVICE_URL } from '@/lib/search-client'
import type { PeopleHit } from '@/lib/search-client'

export interface ProfileResult {
  pubkey: string
  profile: ProfileContent
  /** Present only when the result originated from a Nostr relay fetch. */
  event?: NostrEvent
}

interface UseSearchProfilesOptions {
  /** Search query string */
  query: string
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number
  /** Max results to return (default: 10) */
  limit?: number
}

function peopleHitToProfileResult(hit: PeopleHit): ProfileResult {
  return {
    pubkey: hit.pubkey,
    profile: {
      name: hit.name ?? undefined,
      display_name: hit.display_name ?? undefined,
      username: hit.username ?? undefined,
      about: hit.about ?? undefined,
      picture: hit.picture ?? undefined,
      nip05: hit.nip05 ?? undefined,
      lud16: hit.lud16 ?? undefined,
    },
  }
}

/**
 * Hook for searching user profiles.
 *
 * Fires the nostube-search people index and Primal API in parallel.
 * Meili results appear first (video authors with ranking); Primal fills in
 * any pubkeys not already in the meili results. Deduplicated by pubkey.
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
  const primal = useMemo(() => new PrimalCache(), [])

  const [loading, setLoading] = useState(false)
  const [meiliResults, setMeiliResults] = useState<ProfileResult[]>([])
  const [primalResults, setPrimalResults] = useState<ProfileResult[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => primal.close(), [primal])

  // Debounced query
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  useEffect(() => {
    const trimmed = debouncedQuery.trim()

    if (!trimmed || trimmed.length < 2) {
      setMeiliResults([])
      setPrimalResults([])
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)

    let settled = 0
    const onSettled = () => {
      settled++
      if (settled === 2 && !controller.signal.aborted) setLoading(false)
    }

    // Meili people index
    fetchPeopleResults(trimmed, controller.signal, SEARCH_SERVICE_URL, limit)
      .then(hits => {
        if (controller.signal.aborted) return
        setMeiliResults((hits ?? []).map(peopleHitToProfileResult))
      })
      .catch(() => { if (!controller.signal.aborted) setMeiliResults([]) })
      .finally(onSettled)

    // Primal API
    primal.userSearch(trimmed)
      .then(events => {
        if (controller.signal.aborted) return
        const results: ProfileResult[] = []
        for (const event of events.slice(0, limit * 2)) {
          eventStore.add(event)
          const profile = getProfileContent(event)
          if (profile) results.push({ pubkey: event.pubkey, profile, event })
        }
        setPrimalResults(results)
      })
      .catch(() => { if (!controller.signal.aborted) setPrimalResults([]) })
      .finally(onSettled)

    return () => controller.abort()
  }, [debouncedQuery, eventStore, primal, limit])

  // Merge: meili first, then Primal for pubkeys not already present
  const profiles = useMemo(() => {
    const seen = new Set<string>()
    const merged: ProfileResult[] = []

    for (const r of meiliResults) {
      if (!seen.has(r.pubkey)) { seen.add(r.pubkey); merged.push(r) }
    }
    for (const r of primalResults) {
      if (!seen.has(r.pubkey)) { seen.add(r.pubkey); merged.push(r) }
    }

    return merged.slice(0, limit)
  }, [meiliResults, primalResults, limit])

  return { profiles, loading }
}

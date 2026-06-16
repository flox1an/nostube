import { useState, useEffect, useRef } from 'react'
import type { ProfileContent } from 'applesauce-core/helpers'
import type { NostrEvent } from 'nostr-tools'
import { fetchPeopleResults, type PeopleHit } from '@/lib/search-client'
import { SEARCH_SERVICE_URL } from '@/lib/search-client'

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
 * Hook for searching user profiles using the nostube-search people index.
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
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState<ProfileResult[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // Debounced query
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  useEffect(() => {
    const trimmed = debouncedQuery.trim()

    if (!trimmed || trimmed.length < 2) {
      setProfiles([])
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)

    fetchPeopleResults(trimmed, controller.signal, SEARCH_SERVICE_URL, limit)
      .then(hits => {
        if (controller.signal.aborted) return
        setProfiles((hits ?? []).map(peopleHitToProfileResult))
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfiles([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [debouncedQuery, limit])

  return { profiles, loading }
}

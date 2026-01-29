import { useEffect, useState, useMemo } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY } from '@/constants/relays'
import type { NostrEvent } from 'nostr-tools'

const FOLLOW_SET_IDENTIFIER = 'nostube-follows'

interface UseAuthorFollowingReturn {
  followedPubkeys: string[]
  isLoading: boolean
  followSetEvent: NostrEvent | null
}

/**
 * Hook to fetch another user's kind 30000 follow set (nostube-follows).
 * Returns the list of pubkeys they are following.
 */
export function useAuthorFollowing(
  pubkey: string,
  relays: string[] = []
): UseAuthorFollowingReturn {
  const { pool } = useAppContext()
  const eventStore = useEventStore()
  const [followSetEvent, setFollowSetEvent] = useState<NostrEvent | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Combine provided relays with metadata relay
  const relaysToUse = useMemo(() => {
    const uniqueRelays = new Set([...relays, METADATA_RELAY])
    return Array.from(uniqueRelays)
  }, [relays])

  // Load kind 30000 follow set for the author (fetch from relays)
  useEffect(() => {
    if (!pubkey) return

    const loader = createAddressLoader(pool)
    const subscription = loader({
      kind: 30000,
      pubkey,
      identifier: FOLLOW_SET_IDENTIFIER,
      relays: relaysToUse,
    }).subscribe({
      next: event => {
        eventStore.add(event)
      },
      complete: () => {
        setHasLoaded(true)
      },
    })

    return () => subscription.unsubscribe()
  }, [pubkey, eventStore, pool, relaysToUse])

  // Subscribe to event store changes for this address
  useEffect(() => {
    if (!pubkey) return

    const sub = eventStore
      .addressable({
        kind: 30000,
        pubkey,
        identifier: FOLLOW_SET_IDENTIFIER,
      })
      .subscribe(event => {
        setFollowSetEvent(event ?? null)
      })

    return () => sub.unsubscribe()
  }, [pubkey, eventStore])

  // Extract followed pubkeys from kind 30000
  const followedPubkeys = useMemo(() => {
    if (!followSetEvent) return []
    return followSetEvent.tags.filter(tag => tag[0] === 'p' && tag[1]).map(tag => tag[1])
  }, [followSetEvent])

  return {
    followedPubkeys,
    isLoading: !hasLoaded && !followSetEvent,
    followSetEvent,
  }
}

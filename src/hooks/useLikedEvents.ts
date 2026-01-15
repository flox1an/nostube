import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useMemo, useEffect, useState } from 'react'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

export function useLikedEvents() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const [loadedPubkey, setLoadedPubkey] = useState<string | null>(null)

  const readRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('read')).map(relay => relay.url)
  }, [config.relays])

  // Use EventStore timeline to get user's reactions (kind 7)
  const reactionEvents =
    use$(
      () =>
        eventStore.timeline([
          {
            kinds: [7],
            authors: user?.pubkey ? [user.pubkey] : [],
          },
        ]),
      [eventStore, user?.pubkey]
    ) ?? []

  // Load reactions from relays if not in EventStore
  useEffect(() => {
    if (!user?.pubkey || loadedPubkey === user.pubkey) return

    const filters = {
      kinds: [7],
      authors: [user.pubkey],
    }

    const loader = createTimelineLoader(pool, readRelays, filters, {
      eventStore,
      limit: 500, // Load many reactions
    })

    const subscription = loader().subscribe({
      next: event => {
        eventStore.add(event)
      },
      complete: () => {
        setLoadedPubkey(user.pubkey)
      },
      error: err => {
        console.error('Error loading reactions:', err)
        setLoadedPubkey(user.pubkey)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [user?.pubkey, pool, readRelays, eventStore, loadedPubkey])

  // Extract both event IDs (e tags) and addresses (a tags) for liked events
  // This handles both regular events and addressable events (kinds 34235, 34236)
  const { likedEventIds, likedAddresses } = useMemo(() => {
    if (!user || reactionEvents.length === 0) return { likedEventIds: [], likedAddresses: [] }

    // Sort reaction events by created_at in descending order (most recent first)
    const sortedReactions = [...reactionEvents]
      .filter(event => event.content === '+')
      .sort((a, b) => b.created_at - a.created_at)

    const eventIds: string[] = []
    const addresses: string[] = []

    for (const event of sortedReactions) {
      // Extract 'e' tag (event ID)
      const eTag = event.tags.find(tag => tag[0] === 'e')
      if (eTag?.[1]) {
        eventIds.push(eTag[1])
      }

      // Extract 'a' tag (address for addressable events)
      const aTag = event.tags.find(tag => tag[0] === 'a')
      if (aTag?.[1]) {
        addresses.push(aTag[1])
      }
    }

    // Filter out duplicates (keep first occurrence, which is the most recent like)
    const uniqueEventIds = Array.from(new Set(eventIds))
    const uniqueAddresses = Array.from(new Set(addresses))

    return { likedEventIds: uniqueEventIds, likedAddresses: uniqueAddresses }
  }, [user, reactionEvents])

  const hasLoadedReactions = Boolean(user?.pubkey && loadedPubkey === user.pubkey)

  return {
    data: likedEventIds,
    likedAddresses,
    isLoading: Boolean(user && reactionEvents.length === 0 && !hasLoadedReactions),
    enabled: !!user,
  }
}

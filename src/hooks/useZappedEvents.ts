import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useMemo, useEffect, useState } from 'react'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

/**
 * Hook to get event IDs that the current user has zapped.
 * Zap requests (kind 9734) contain the target event ID in e/a tags.
 */
export function useZappedEvents() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const [loadedPubkey, setLoadedPubkey] = useState<string | null>(null)

  const readRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('read')).map(relay => relay.url)
  }, [config.relays])

  // Use EventStore timeline to get user's zap requests (kind 9734)
  const zapRequestEvents =
    use$(
      () =>
        eventStore.timeline([
          {
            kinds: [9734],
            authors: user?.pubkey ? [user.pubkey] : [],
          },
        ]),
      [eventStore, user?.pubkey]
    ) ?? []

  // Load zap requests from relays if not in EventStore
  useEffect(() => {
    if (!user?.pubkey || loadedPubkey === user.pubkey) return

    const filters = {
      kinds: [9734],
      authors: [user.pubkey],
    }

    const loader = createTimelineLoader(pool, readRelays, filters, {
      eventStore,
      limit: 500, // Load many zap requests
    })

    const subscription = loader().subscribe({
      next: event => {
        eventStore.add(event)
      },
      complete: () => {
        setLoadedPubkey(user.pubkey)
      },
      error: err => {
        console.error('Error loading zap requests:', err)
        setLoadedPubkey(user.pubkey)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [user?.pubkey, pool, readRelays, eventStore, loadedPubkey])

  // Extract event IDs and addresses from zap requests
  const { zappedEventIds, zappedAddresses } = useMemo(() => {
    if (!user || zapRequestEvents.length === 0) return { zappedEventIds: [], zappedAddresses: [] }

    // Sort zap request events by created_at in descending order (most recent first)
    const sortedZaps = [...zapRequestEvents].sort((a, b) => b.created_at - a.created_at)

    const eventIds: string[] = []
    const addresses: string[] = []

    for (const event of sortedZaps) {
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

    // Filter out duplicates (keep first occurrence, which is the most recent zap)
    const uniqueEventIds = Array.from(new Set(eventIds))
    const uniqueAddresses = Array.from(new Set(addresses))

    return { zappedEventIds: uniqueEventIds, zappedAddresses: uniqueAddresses }
  }, [user, zapRequestEvents])

  const hasLoadedZaps = Boolean(user?.pubkey && loadedPubkey === user.pubkey)

  return {
    data: zappedEventIds,
    zappedAddresses,
    isLoading: Boolean(user && zapRequestEvents.length === 0 && !hasLoadedZaps),
    enabled: !!user,
  }
}

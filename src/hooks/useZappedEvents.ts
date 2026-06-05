import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMemo } from 'react'
import { useNostrQuery } from '@/nostr/useNostrQuery'

/**
 * Hook to get event IDs that the current user has zapped.
 * Zap requests (kind 9734) contain the target event ID in e/a tags.
 */
export function useZappedEvents() {
  const { user } = useCurrentUser()

  const filters = useMemo(
    () => (user?.pubkey ? { kinds: [9734], authors: [user.pubkey], limit: 500 } : null),
    [user?.pubkey]
  )

  const { events: zapRequestEvents, isLoading } = useNostrQuery(filters)

  const { zappedEventIds, zappedAddresses } = useMemo(() => {
    if (!user || zapRequestEvents.length === 0) return { zappedEventIds: [], zappedAddresses: [] }

    const sortedZaps = [...zapRequestEvents].sort((a, b) => b.created_at - a.created_at)

    const eventIds: string[] = []
    const addresses: string[] = []

    for (const event of sortedZaps) {
      const eTag = event.tags.find(tag => tag[0] === 'e')
      if (eTag?.[1]) eventIds.push(eTag[1])

      const aTag = event.tags.find(tag => tag[0] === 'a')
      if (aTag?.[1]) addresses.push(aTag[1])
    }

    return {
      zappedEventIds: Array.from(new Set(eventIds)),
      zappedAddresses: Array.from(new Set(addresses)),
    }
  }, [user, zapRequestEvents])

  return {
    data: zappedEventIds,
    zappedAddresses,
    isLoading: Boolean(user && isLoading),
    enabled: !!user,
  }
}

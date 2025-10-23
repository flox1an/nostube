import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { useMemo } from 'react'

export function useLikedEvents() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()

  // Use EventStore timeline to get user's reactions (kind 7)
  const reactionsObservable = eventStore.timeline([
    {
      kinds: [7],
      authors: user?.pubkey ? [user.pubkey] : [],
    },
  ])

  const reactionEvents = useObservableState(reactionsObservable, [])

  const likedEventIds = useMemo(() => {
    if (!user || reactionEvents.length === 0) return []

    const eventIds = reactionEvents
      .filter(event => event.content === '+')
      .map(event => {
        const eTag = event.tags.find(tag => tag[0] === 'e')
        return eTag ? eTag[1] : undefined
      })
      .filter((id): id is string => id !== undefined)

    return eventIds
  }, [user, reactionEvents])

  return {
    data: likedEventIds,
    isLoading: user && reactionEvents.length === 0,
    enabled: !!user,
  }
}

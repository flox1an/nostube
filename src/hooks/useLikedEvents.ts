import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { useMemo, useEffect, useState } from 'react'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

export function useLikedEvents() {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const [hasLoadedReactions, setHasLoadedReactions] = useState(false)

  const readRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('read')).map(relay => relay.url)
  }, [config.relays])

  // Use EventStore timeline to get user's reactions (kind 7)
  const reactionsObservable = eventStore.timeline([
    {
      kinds: [7],
      authors: user?.pubkey ? [user.pubkey] : [],
    },
  ])

  const reactionEvents = useObservableState(reactionsObservable, [])

  // Load reactions from relays if not in EventStore
  useEffect(() => {
    if (!user?.pubkey || hasLoadedReactions) return

    const filters = {
      kinds: [7],
      authors: [user.pubkey],
    }

    setHasLoadedReactions(true)
    const loader = createTimelineLoader(pool, readRelays, filters, {
      eventStore,
      limit: 500, // Load many reactions
    })

    const subscription = loader().subscribe({
      next: event => {
        eventStore.add(event)
      },
      complete: () => {
        // Reactions loaded
      },
      error: err => {
        console.error('Error loading reactions:', err)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [user?.pubkey, pool, readRelays, eventStore, hasLoadedReactions])

  // Reset hasLoadedReactions when user changes
  useEffect(() => {
    setHasLoadedReactions(false)
  }, [user?.pubkey])

  const likedEventIds = useMemo(() => {
    if (!user || reactionEvents.length === 0) return []

    const eventIds = reactionEvents
      .filter(event => event.content === '+')
      .map(event => {
        const eTag = event.tags.find(tag => tag[0] === 'e')
        return eTag ? eTag[1] : undefined
      })
      .filter((id): id is string => id !== undefined)

    // Filter out duplicate event IDs (user might have liked the same video multiple times)
    const uniqueEventIds = Array.from(new Set(eventIds))

    return uniqueEventIds
  }, [user, reactionEvents])

  return {
    data: likedEventIds,
    isLoading: user && reactionEvents.length === 0 && !hasLoadedReactions,
    enabled: !!user,
  }
}

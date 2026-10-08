import { useEffect, useMemo } from 'react'
import { useEventModel, useEventStore } from 'applesauce-react/hooks'
import { ReactionsModel } from 'applesauce-common/models'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useAppContext } from './useAppContext'
import { createReactionsLoader } from 'applesauce-loaders/loaders'
import type { NostrEvent } from 'nostr-tools'
import { combineRelays } from '@/lib/utils'

interface UseReactionsOptions {
  eventId: string
  authorPubkey: string
  kind: number
  relays?: string[]
}

/**
 * Hook to load and manage reactions for a Nostr event
 * Loads reactions from relays (using event relays + app relays) and stores them in EventStore
 */
export function useReactions({ eventId, authorPubkey, kind, relays = [] }: UseReactionsOptions) {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()

  const storedEvent = useMemo(() => eventStore.getEvent(eventId), [eventStore, eventId])

  const seenRelayList = useMemo(() => {
    if (!storedEvent) return []
    const relaysSet = getSeenRelays(storedEvent)
    return relaysSet ? Array.from(relaysSet) : []
  }, [storedEvent])

  // Create a dummy event object for ReactionsModel if we don't have the original event
  const fallbackEvent: NostrEvent = useMemo(
    () => ({
      id: eventId,
      pubkey: authorPubkey,
      created_at: 0,
      kind,
      tags: [],
      content: '',
      sig: '',
    }),
    [eventId, authorPubkey, kind]
  )

  const targetEvent = storedEvent ?? fallbackEvent

  // Use ReactionsModel to get reactions from EventStore
  const reactions = useEventModel(ReactionsModel, [targetEvent]) || []

  // Combine relays from nevent and app config
  const relaysToUse = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    return combineRelays([relays, seenRelayList, readRelays])
  }, [relays, seenRelayList, config.relays])

  // Load reactions from relays
  useEffect(() => {
    if (!eventId || relaysToUse.length === 0) return

    const loader = createReactionsLoader(pool, {
      eventStore,
      useSeenRelays: true, // Use relays where the original event was seen
    })

    const subscription = loader(targetEvent, relaysToUse).subscribe({
      next: _reactionEvent => {
        // Reactions are automatically added to EventStore by the loader
      },
      error: err => {
        console.error('Error loading reactions:', err)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [eventId, pool, eventStore, targetEvent, relaysToUse])

  return reactions
}

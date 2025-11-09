import { useEffect, useMemo } from 'react'
import { useEventModel, useEventStore } from 'applesauce-react/hooks'
import { ReactionsModel } from 'applesauce-core/models'
import { useAppContext } from './useAppContext'
import { createReactionsLoader } from 'applesauce-loaders/loaders'
import type { NostrEvent } from 'nostr-tools'

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

  // Create a dummy event object for ReactionsModel
  const dummyEvent: NostrEvent = useMemo(
    () => ({
      id: eventId,
      pubkey: authorPubkey,
      created_at: 0,
      kind: kind,
      tags: [],
      content: '',
      sig: '',
    }),
    [eventId, authorPubkey, kind]
  )

  // Use ReactionsModel to get reactions from EventStore
  const reactions = useEventModel(ReactionsModel, [dummyEvent]) || []

  // Combine relays from nevent and app config
  const relaysToUse = useMemo(() => {
    const readRelays = config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
    const combinedRelays = [...new Set([...relays, ...readRelays])]
    return combinedRelays
  }, [relays, config.relays])

  // Load reactions from relays
  useEffect(() => {
    if (!eventId || relaysToUse.length === 0) return

    const loader = createReactionsLoader(pool, {
      eventStore,
      useSeenRelays: true, // Use relays where the original event was seen
    })

    const subscription = loader(dummyEvent, relaysToUse).subscribe({
      next: reactionEvent => {
        // Reactions are automatically added to EventStore by the loader
      },
      error: err => {
        console.error('Error loading reactions:', err)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [eventId, pool, eventStore, dummyEvent, relaysToUse])

  return reactions
}

import { useState } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { useEventStore } from 'applesauce-react/hooks'
import { type EventTemplate, type Event } from 'nostr-tools'
import { nowInSecs } from '@/lib/utils'
import { relayPool } from '@/nostr/core'

type PublishArgs = {
  event: EventTemplate
  relays?: string[]
}

interface PublishResult {
  publish: (args: PublishArgs) => Promise<Event>
  isPending: boolean
  error: Error | null
}

export function useNostrPublish(): PublishResult {
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const eventStore = useEventStore()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const publish = async (args: PublishArgs): Promise<Event> => {
    if (!user) {
      throw new Error('User is not logged in')
    }

    setIsPending(true)
    setError(null)

    try {
      const tags = args.event.tags ?? []

      // Add the client tag if it doesn't exist
      if (!tags.some(tag => tag[0] === 'client')) {
        tags.push(['client', 'nostube'])
      }

      const eventTemplate: EventTemplate = {
        kind: args.event.kind,
        content: args.event.content ?? '',
        tags,
        created_at: args.event.created_at ?? nowInSecs(),
      }

      // Sign the event using the user's signer
      const signedEvent = await user.signer.signEvent(eventTemplate)

      // Publish to relays (simplified - in a real implementation you'd use a relay pool)
      const relaysToUse = args.relays || config.relays.map(r => r.url)

      await relayPool.publish(relaysToUse, signedEvent)

      // NIP-65: Re-broadcast user's kind:10002 relay list to the same relays
      // This improves discoverability of the user's relay preferences
      const userRelayList = eventStore.getReplaceable(10002, user.pubkey)
      if (userRelayList) {
        try {
          await relayPool.publish(relaysToUse, userRelayList)
        } catch (err) {
          // Don't fail the main publish if relay list re-broadcast fails
          console.warn('[useNostrPublish] Failed to re-broadcast kind:10002:', err)
        }
      }

      return signedEvent
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to publish event')
      setError(error)
      throw error
    } finally {
      setIsPending(false)
    }
  }

  return {
    publish,
    isPending,
    error,
  }
}

import { useState } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
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

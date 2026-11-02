import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { useEventStore } from 'applesauce-react/hooks'
import { type EventTemplate, type Event } from 'nostr-tools'
import { publishRelays, signAndPublish } from '@nostube/widgets/publish-relays'
import { nowInSecs } from '@/lib/utils'
import { relayPool } from '@/nostr/core'

type PublishArgs = {
  event: EventTemplate
  relays?: string[]
  /** User-facing action name for the shared publication status. */
  label?: string
}

interface PublishResult {
  publish: (args: PublishArgs) => Promise<Event>
  isPending: boolean
  error: Error | null
}

// Keyed by user, template (without created_at) and relays. Module scope so remounted dialogs share it.
// Identical requests in flight (double click/submit) share one signature and one publish.
const inFlight = new Map<string, Promise<Event>>()

export function useNostrPublish(): PublishResult {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { config } = useAppContext()
  const eventStore = useEventStore()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const running = useRef(0)

  const run = async (args: PublishArgs, relays: string[], key: string): Promise<Event> => {
    if (!user) throw new Error('User is not logged in')

    const tags = args.event.tags ?? []
    const eventTemplate: EventTemplate = {
      kind: args.event.kind,
      content: args.event.content ?? '',
      tags: tags.some(tag => tag[0] === 'client') ? tags : [...tags, ['client', 'nostube']],
      created_at: args.event.created_at ?? nowInSecs(),
    }
    const signedEvent = await signAndPublish({
      key,
      label: args.label ?? t('upload.publishToRelays'),
      sign: () => user.signer.signEvent(eventTemplate),
      pool: relayPool,
      relays,
      onConfirmed: event => eventStore.add(event),
    })

    // NIP-65: re-broadcast the user's kind:10002 relay list to the same relays for
    // discoverability. Secondary: never delays or fails the main publish.
    const userRelayList = eventStore.getReplaceable(10002, user.pubkey)
    if (userRelayList) {
      publishRelays({ pool: relayPool, event: userRelayList, relays, quiet: true }).catch(err =>
        console.warn('[useNostrPublish] Failed to re-broadcast kind:10002:', err)
      )
    }

    return signedEvent
  }

  const publish = async (args: PublishArgs): Promise<Event> => {
    const relays = args.relays || config.relays.map(r => r.url)
    const key = JSON.stringify([
      user?.pubkey,
      args.event.kind,
      args.event.content,
      args.event.tags,
      relays,
    ])
    const existing = inFlight.get(key)
    if (existing) return existing

    running.current++
    setIsPending(true)
    setError(null)
    const promise = run(args, relays, key)
    inFlight.set(key, promise)
    try {
      return await promise
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to publish event')
      setError(error)
      throw error
    } finally {
      inFlight.delete(key)
      if (--running.current === 0) setIsPending(false)
    }
  }

  return {
    publish,
    isPending,
    error,
  }
}

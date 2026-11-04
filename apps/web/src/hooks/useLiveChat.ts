import { use$, useEventStore } from 'applesauce-react/hooks'
import { useMemo } from 'react'
import type { Filter } from 'nostr-tools'
import type { LiveStream } from '@nostube/core/live-stream'
import { useLiveRelayFeed } from './useLiveStreams'

const CHAT_LIMIT = 300
const MAX_FUTURE_SKEW_SECONDS = 60

/**
 * NIP-53 live chat (kind 1311) and zap receipts (kind 9735) for a stream, kept live.
 * Returns the newest CHAT_LIMIT events in chronological order.
 */
export function useLiveChat(stream: LiveStream) {
  const eventStore = useEventStore()
  const { address, starts } = stream
  const eventId = stream.event.id

  // Chat REQ keys on address/starts only: heartbeat updates change event.id every minute,
  // which must re-key only the small #e receipt REQ.
  const chatFilters = useMemo<Filter[]>(
    () => [
      {
        kinds: [1311, 9735],
        '#a': [address],
        limit: CHAT_LIMIT,
        ...(starts ? { since: starts } : {}),
      },
    ],
    [address, starts]
  )
  const receiptFilters = useMemo<Filter[]>(
    () => [
      { kinds: [9735], '#e': [eventId], limit: CHAT_LIMIT, ...(starts ? { since: starts } : {}) },
    ],
    [eventId, starts]
  )
  const chat = useLiveRelayFeed(chatFilters, stream.relays)
  const receipts = useLiveRelayFeed(receiptFilters, stream.relays)
  const timeline = use$(
    () => eventStore.timeline([...chatFilters, ...receiptFilters]),
    [eventStore, chatFilters, receiptFilters]
  )

  const events = useMemo(() => {
    const maxCreatedAt = Math.floor(Date.now() / 1000) + MAX_FUTURE_SKEW_SECONDS
    return (timeline ?? [])
      .filter(event => event.created_at <= maxCreatedAt)
      .sort((a, b) => a.created_at - b.created_at)
      .slice(-CHAT_LIMIT)
  }, [timeline])

  return { events, isLoading: chat.isLoading, error: chat.error ?? receipts.error }
}

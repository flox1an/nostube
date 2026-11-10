import { use$, useEventStore } from 'applesauce-react/hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Filter } from 'nostr-tools'
import type { LiveStream } from '@nostube/core/live-stream'
import { useAppContext } from './useAppContext'
import { useLiveRelayFeed } from './useLiveStreams'

/** Events fetched by the first REQ and by each older page. */
const CHAT_PAGE = 100
const MAX_FUTURE_SKEW_SECONDS = 60

/**
 * NIP-53 live chat (kind 1311) and zap receipts (kind 9735) for a stream, kept live.
 * Loads the newest CHAT_PAGE events (no time window: `starts` moves on stream restarts) and
 * `loadOlder()` fetches the page before the oldest message. Returns events in chronological order.
 */
export function useLiveChat(stream: LiveStream) {
  const { pool } = useAppContext()
  const eventStore = useEventStore()
  const { address } = stream
  const eventId = stream.event.id

  // Chat REQ keys on address only: heartbeat updates change event.id every minute,
  // which must re-key only the small #e receipt REQ.
  const chatFilter = useMemo<Filter>(() => ({ kinds: [1311, 9735], '#a': [address] }), [address])
  const receiptFilter = useMemo<Filter>(() => ({ kinds: [9735], '#e': [eventId] }), [eventId])
  const chatReq = useMemo(() => [{ ...chatFilter, limit: CHAT_PAGE }], [chatFilter])
  const receiptReq = useMemo(() => [{ ...receiptFilter, limit: CHAT_PAGE }], [receiptFilter])
  const chat = useLiveRelayFeed(chatReq, stream.relays)
  const receipts = useLiveRelayFeed(receiptReq, stream.relays)
  // No limit here: the store holds every page loaded so far.
  const timeline = use$(
    () => eventStore.timeline([chatFilter, receiptFilter]),
    [eventStore, chatFilter, receiptFilter]
  )

  const events = useMemo(() => {
    const maxCreatedAt = Math.floor(Date.now() / 1000) + MAX_FUTURE_SKEW_SECONDS
    return (timeline ?? [])
      .filter(event => event.created_at <= maxCreatedAt)
      .sort((a, b) => a.created_at - b.created_at)
  }, [timeline])

  const [exhausted, setExhausted] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  useEffect(() => {
    setExhausted(false)
    setLoadingOlder(false)
  }, [address])

  // Receipts via #e can predate the oldest chat event; the page cursor follows the #a feed only.
  const oldest = useMemo(
    () =>
      events.find(event => event.tags.some(tag => tag[0] === 'a' && tag[1] === address))
        ?.created_at,
    [events, address]
  )
  const { relays } = chat
  const loadOlder = useCallback(() => {
    if (loadingOlder || exhausted || oldest === undefined) return
    setLoadingOlder(true)
    let added = 0
    // `until` is inclusive: the store drops the repeats, a page without new events is the end.
    pool.request(relays, [{ ...chatFilter, until: oldest, limit: CHAT_PAGE }]).subscribe({
      next: event => {
        if (!eventStore.hasEvent(event.id)) added++
        eventStore.add(event)
      },
      error: () => {
        // ponytail: an error ends paging for this stream; retry on remount
        setLoadingOlder(false)
        setExhausted(true)
      },
      complete: () => {
        setLoadingOlder(false)
        if (!added) setExhausted(true)
      },
    })
  }, [pool, eventStore, relays, chatFilter, oldest, exhausted, loadingOlder])

  return {
    events,
    isLoading: chat.isLoading,
    error: chat.error ?? receipts.error,
    relays,
    loadOlder,
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NostrEvent } from 'nostr-tools'
import {
  createEventLoader,
  createAddressLoader,
  createTimelineLoader,
} from 'applesauce-loaders/loaders'
import { processEvents } from '@nostube/core/video-event'
import type { VideoEvent } from '@nostube/core/video-event'
import { useAppContext } from '@/hooks/useAppContext'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useEventStore, use$ } from 'applesauce-react/hooks'

/** One pinned video reference from a kind-10001 pin list: an event id or an address. */
export interface PinRef {
  id?: string
  address?: string
}

/** The `e`/`a` tags of a pin list that point at videos (kinds 34235/34236 for addresses). */
export function parsePinRefs(tags: string[][]): PinRef[] {
  return tags.flatMap((tag): PinRef[] => {
    if (tag[0] === 'e' && tag[1]) return [{ id: tag[1] }]
    if (tag[0] === 'a' && tag[1]) {
      const parts = tag[1].split(':')
      const kind = parseInt(parts[0] || '0', 10)
      if (kind === 34235 || kind === 34236) return [{ address: tag[1] }]
    }
    return []
  })
}

/**
 * The author's pinned videos (kind 10001, NIP-51): subscribes to the author's pin lists
 * over the given relays, resolves the newest list's references against the event store
 * (fetching what is missing), and returns the processed videos, deduped.
 */
export function useAuthorPinnedVideos({
  pubkey,
  relays,
}: {
  pubkey: string
  relays: string[]
}): VideoEvent[] {
  const { pool, config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const eventStoreInstance = useEventStore()

  const pinFilter = useMemo(() => [{ kinds: [10001], authors: pubkey ? [pubkey] : [] }], [pubkey])
  const rawPinEvents = use$(
    () => eventStoreInstance.timeline(pinFilter),
    [eventStoreInstance, pinFilter]
  )
  const pinEvents = useMemo(() => rawPinEvents ?? [], [rawPinEvents])
  const [pinnedVideos, setPinnedVideos] = useState<VideoEvent[]>([])
  const loadedPinsKeyRef = useRef<string | null>(null)

  // Load the pin lists themselves (a timeline subscription over the author's relays).
  useEffect(() => {
    const pinsKey = `${pubkey}:${relays.join(',')}`
    if (!pubkey || loadedPinsKeyRef.current === pinsKey) return
    loadedPinsKeyRef.current = pinsKey
    let unsubscribe: (() => void) | undefined

    const loadPinList = async () => {
      try {
        const pinLoader = createTimelineLoader(pool, relays, pinFilter, {
          eventStore: eventStoreInstance,
        })
        const sub = pinLoader().subscribe({
          next: event => eventStoreInstance.add(event),
          error: () => {},
        })
        unsubscribe = () => sub.unsubscribe()
      } catch (error) {
        console.error('Failed to load pin list:', error)
      }
    }

    void loadPinList()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [pubkey, pool, relays, pinFilter, eventStoreInstance])

  // Resolve the newest pin list's references to full video events.
  useEffect(() => {
    if (!pubkey) return
    let cancelled = false

    const loadPinnedVideos = async () => {
      try {
        const latestPinEvent = [...pinEvents].sort((a, b) => b.created_at - a.created_at)[0]
        if (!latestPinEvent) {
          if (!cancelled) setPinnedVideos([])
          return
        }

        const refs = parsePinRefs(latestPinEvent.tags)
        if (refs.length === 0) {
          if (!cancelled) setPinnedVideos([])
          return
        }

        const fetches = refs.map(async ref => {
          if (ref.address) {
            const parts = ref.address.split(':')
            if (parts.length < 3) return null
            const kind = parseInt(parts[0], 10)
            const author = parts[1]
            const identifier = parts.slice(2).join(':')
            const existing = eventStoreInstance.getReplaceable(kind, author, identifier)
            if (existing) return existing
            const loader = createAddressLoader(pool, {
              eventStore: eventStoreInstance,
              extraRelays: relays,
            })
            return loader({ kind, pubkey: author, identifier })
              .toPromise()
              .catch(() => null)
          }

          if (!ref.id) return null
          const existing = eventStoreInstance.getEvent(ref.id)
          if (existing) return existing
          const loader = createEventLoader(pool, {
            eventStore: eventStoreInstance,
            extraRelays: relays,
          })
          return loader({ id: ref.id })
            .toPromise()
            .catch(() => null)
        })

        const loadedEvents = (await Promise.all(fetches)).filter((e): e is NostrEvent => Boolean(e))
        const processed = processEvents(loadedEvents, relays, {
          blossomServers: config.blossomServers,
          nsfwPubkeys: presetContent.nsfwPubkeys,
          reportedEventIds: config.reportedEventIds,
          includeYouTube: config.showYouTubeContent ?? true,
          includeAudio: true,
        })
        const deduped = Array.from(new Map(processed.map(video => [video.id, video])).values())
        if (!cancelled) setPinnedVideos(deduped)
      } catch (error) {
        console.error('Failed to load pinned videos:', error)
      }
    }

    loadPinnedVideos()
    return () => {
      cancelled = true
    }
  }, [
    pubkey,
    pinEvents,
    pool,
    relays,
    eventStoreInstance,
    config.blossomServers,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
  ])

  return pinnedVideos
}

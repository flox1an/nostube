import { useEffect, useState } from 'react'
import type { NostrEvent } from 'nostr-tools'
import { createEventLoader, createAddressLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@nostube/core/video-event'
import type { VideoEvent } from '@nostube/core/video-event'
import { parsePinRefs } from '@nostube/core/pin-list'
import { useAppContext } from '@/hooks/useAppContext'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useEventStore } from 'applesauce-react/hooks'
import { usePinList } from '@nostube/widgets/hooks/usePinList'

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

  const { event: pinListEvent } = usePinList(pool, relays, pubkey)
  const [pinnedVideos, setPinnedVideos] = useState<VideoEvent[]>([])

  // Resolve the newest pin list's references to full video events.
  useEffect(() => {
    if (!pubkey) {
      setPinnedVideos([])
      return
    }
    let cancelled = false

    const loadPinnedVideos = async () => {
      try {
        const latestPinEvent = pinListEvent
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
    pinListEvent,
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

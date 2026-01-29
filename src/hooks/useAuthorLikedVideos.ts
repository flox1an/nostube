import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useMemo, useEffect, useState } from 'react'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { useStableRelays } from './useStableRelays'
import { getKindsForType } from '@/lib/video-types'

// Video event kinds
const VIDEO_KINDS = new Set(getKindsForType('all'))

/**
 * Hook to get event IDs that a specific author has liked or zapped.
 * Combines both reactions (kind 7) and zap requests (kind 9734).
 * Only includes likes/zaps for video events (kinds 21, 22, 34235, 34236).
 */
export function useAuthorLikedVideos(pubkey: string | undefined) {
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const relays = useStableRelays()
  const [loadedPubkey, setLoadedPubkey] = useState<string | null>(null)

  // Use EventStore timeline to get author's reactions (kind 7) and zap requests (kind 9734)
  const reactionEvents =
    use$(
      () =>
        eventStore.timeline([
          {
            kinds: [7],
            authors: pubkey ? [pubkey] : [],
          },
        ]),
      [eventStore, pubkey]
    ) ?? []

  const zapRequestEvents =
    use$(
      () =>
        eventStore.timeline([
          {
            kinds: [9734],
            authors: pubkey ? [pubkey] : [],
          },
        ]),
      [eventStore, pubkey]
    ) ?? []

  // Load reactions and zaps from relays if not in EventStore
  useEffect(() => {
    if (!pubkey || loadedPubkey === pubkey) return

    // Load reactions (kind 7)
    const reactionLoader = createTimelineLoader(
      pool,
      relays,
      { kinds: [7], authors: [pubkey] },
      { eventStore, limit: 200 }
    )

    // Load zap requests (kind 9734)
    const zapLoader = createTimelineLoader(
      pool,
      relays,
      { kinds: [9734], authors: [pubkey] },
      { eventStore, limit: 200 }
    )

    let completedCount = 0
    const checkComplete = () => {
      completedCount++
      if (completedCount === 2) {
        setLoadedPubkey(pubkey)
      }
    }

    const reactionSub = reactionLoader().subscribe({
      next: event => eventStore.add(event),
      complete: checkComplete,
      error: () => checkComplete(),
    })

    const zapSub = zapLoader().subscribe({
      next: event => eventStore.add(event),
      complete: checkComplete,
      error: () => checkComplete(),
    })

    return () => {
      reactionSub.unsubscribe()
      zapSub.unsubscribe()
    }
  }, [pubkey, pool, relays, eventStore, loadedPubkey])

  // Check if an event targets a video kind
  const isVideoTarget = (event: { tags: string[][] }) => {
    // Check 'k' tag for the kind of the target event
    const kTag = event.tags.find(tag => tag[0] === 'k')
    if (kTag?.[1]) {
      const targetKind = parseInt(kTag[1], 10)
      if (VIDEO_KINDS.has(targetKind)) return true
    }

    // Check 'a' tag for addressable video events (kind:pubkey:d-tag format)
    const aTag = event.tags.find(tag => tag[0] === 'a')
    if (aTag?.[1]) {
      const parts = aTag[1].split(':')
      if (parts.length >= 1) {
        const addressKind = parseInt(parts[0], 10)
        if (VIDEO_KINDS.has(addressKind)) return true
      }
    }

    return false
  }

  // Extract event IDs from reactions and zaps (only for video events)
  const eventIds = useMemo(() => {
    if (!pubkey) return []

    const ids = new Set<string>()

    // From reactions (only positive reactions for video events)
    for (const event of reactionEvents) {
      if (event.content === '+' && isVideoTarget(event)) {
        const eTag = event.tags.find(tag => tag[0] === 'e')
        if (eTag?.[1]) ids.add(eTag[1])
      }
    }

    // From zap requests (only for video events)
    for (const event of zapRequestEvents) {
      if (isVideoTarget(event)) {
        const eTag = event.tags.find(tag => tag[0] === 'e')
        if (eTag?.[1]) ids.add(eTag[1])
      }
    }

    return Array.from(ids)
  }, [pubkey, reactionEvents, zapRequestEvents])

  const hasLoaded = Boolean(pubkey && loadedPubkey === pubkey)
  const isLoading = Boolean(pubkey && !hasLoaded)

  return {
    eventIds,
    isLoading,
    count: eventIds.length,
  }
}

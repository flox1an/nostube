import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { useReportedPubkeys } from './useReportedPubkeys'
import { useAppContext } from './useAppContext'
import { useReadRelays } from './useReadRelays'
import { useSelectedPreset } from './useSelectedPreset'
import { useEffect, useMemo, useState } from 'react'
import { getKindsForType } from '@/lib/video-types'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { finalize, map } from 'rxjs'
import { type VideoType } from '@/contexts/AppContext'
import { hashObjectBigInt } from '@/lib/utils'
import { useMissingVideos } from './useMissingVideos'
import { logSubscriptionCreated, logSubscriptionClosed } from '@/lib/relay-debug'

const lastLoadedTimestamp = new Map<string, number>()

export default function useVideoTimeline(type: VideoType, authors?: string[]) {
  const blockedPubkeys = useReportedPubkeys()
  const { getAllMissingVideos } = useMissingVideos()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const [videosLoading, setVideosLoading] = useState(false)

  const readRelays = useReadRelays()

  const missingVideoIds = useMemo(() => {
    const missingMap = getAllMissingVideos()
    return new Set(Object.keys(missingMap))
  }, [getAllMissingVideos])

  const filters = useMemo(() => {
    const result = authors
      ? { kinds: getKindsForType(type), authors }
      : { kinds: getKindsForType(type) }
    return result
  }, [type, authors])

  const hash = useMemo(() => {
    return hashObjectBigInt(filters)
  }, [filters])

  const videos$ = useMemo(() => {
    const result = eventStore.timeline(filters).pipe(
      map(events => {
        return processEvents(
          events,
          readRelays,
          blockedPubkeys,
          config.blossomServers,
          missingVideoIds,
          presetContent.nsfwPubkeys
        )
      })
    )
    return result
  }, [
    eventStore,
    readRelays,
    blockedPubkeys,
    filters,
    config.blossomServers,
    missingVideoIds,
    presetContent.nsfwPubkeys,
  ])

  const videos =
    useObservableMemo(() => {
      return videos$
    }, [videos$]) || []

  useEffect(() => {
    const lastLoaded = lastLoadedTimestamp.get(hash)

    // Load only if never loaded or if last load was more than 60 seconds ago
    if (lastLoaded === undefined || Date.now() - lastLoaded > 60000) {
      let cancelled = false
      ;(async () => {
        await Promise.resolve()
        if (!cancelled) {
          setVideosLoading(true)
        }
      })()
      const subId = logSubscriptionCreated('useVideoTimeline', readRelays, filters)

      const subscription = createTimelineLoader(pool, readRelays, filters, {
        limit: 50,
        eventStore,
      })()
        .pipe(
          finalize(() => {
            lastLoadedTimestamp.set(hash, Date.now())
            if (!cancelled) {
              setVideosLoading(false)
            }
            logSubscriptionClosed(subId)
          })
        )
        .subscribe(e => {
          eventStore.add(e)
        })

      // Cleanup subscription on unmount or dependency change
      return () => {
        cancelled = true
        subscription.unsubscribe()
        logSubscriptionClosed(subId)
      }
    }
  }, [eventStore, hash, filters, pool, readRelays])

  return { videos, videosLoading }
}

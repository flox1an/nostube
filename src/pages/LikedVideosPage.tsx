import { VideoGrid } from '@/components/VideoGrid'
import { VideoGridSkeleton } from '@/components/VideoGridSkeleton'
import { useAppContext, useLikedEvents, useReadRelays, useReportedPubkeys } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useMemo, useEffect, useState, useRef } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createEventLoader } from 'applesauce-loaders/loaders'
import { processEvents } from '@/utils/video-event'
import { useTranslation } from 'react-i18next'

export function LikedVideosPage() {
  const { t } = useTranslation()
  const { data: likedEventIds = [], isLoading: isLoadingReactions } = useLikedEvents()
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const blockedPubkeys = useReportedPubkeys()
  const { presetContent } = useSelectedPreset()
  const [loadingVideos, setLoadingVideos] = useState(false)
  const loadingRef = useRef(false)
  const likedIdsStringRef = useRef<string>('')
  const [, forceUpdate] = useState(0)

  const readRelays = useReadRelays()

  // Convert likedEventIds to string for stable comparison
  // Note: Don't sort here - the order is already sorted by date from useLikedEvents
  const likedIdsString = useMemo(() => {
    return likedEventIds.join(',')
  }, [likedEventIds])

  // Get video events directly from EventStore by IDs
  // Recalculate when likedIdsString changes or when we finish loading (via forceUpdate state)
  const videos = useMemo(() => {
    if (likedEventIds.length === 0) return []

    // Deduplicate liked event IDs (safety check in case duplicates slip through)
    const uniqueLikedIds = Array.from(new Set(likedEventIds))

    // Get events directly from EventStore
    const events = uniqueLikedIds.map(id => eventStore.getEvent(id)).filter(Boolean)

    const processed = processEvents(
      events,
      readRelays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )

    // Final deduplication: filter out any duplicate videos by ID (just in case)
    const seenIds = new Set<string>()
    return processed.filter(video => {
      if (seenIds.has(video.id)) {
        return false
      }
      seenIds.add(video.id)
      return true
    })
  }, [
    likedIdsString,
    forceUpdate,
    eventStore,
    readRelays,
    blockedPubkeys,
    config.blossomServers,
    presetContent.nsfwPubkeys,
  ])

  // Load missing video events from relays
  useEffect(() => {
    // Reset loading state when liked IDs change
    if (likedIdsString !== likedIdsStringRef.current) {
      likedIdsStringRef.current = likedIdsString
      loadingRef.current = false
      setLoadingVideos(false)
    }

    // Only proceed if IDs changed or if we're not already loading
    if (likedEventIds.length === 0 || loadingRef.current) return

    // Find missing event IDs (only check EventStore)
    const missingIds = likedEventIds.filter(id => !eventStore.getEvent(id))

    if (missingIds.length === 0) {
      setLoadingVideos(false)
      return
    }

    loadingRef.current = true
    setLoadingVideos(true)

    // Load events in chunks to avoid relay limits
    const CHUNK_SIZE = 50
    const chunks: string[][] = []
    for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
      chunks.push(missingIds.slice(i, i + CHUNK_SIZE))
    }

    const loader = createEventLoader(pool, { eventStore })

    // Load all chunks and track completion
    let completedCount = 0
    const checkComplete = () => {
      completedCount++
      if (completedCount === chunks.length) {
        loadingRef.current = false
        setLoadingVideos(false)
      }
    }

    const subscriptions = chunks.map(chunk => {
      let chunkEventCount = 0
      // @ts-expect-error - createEventLoader accepts ids parameter, types may be incomplete
      return loader({ ids: chunk }).subscribe({
        next: event => {
          const wasPresent = !!eventStore.getEvent(event.id)
          eventStore.add(event)
          // Only update if this event wasn't already in the store (new video appeared)
          if (!wasPresent) {
            chunkEventCount++
            // Batch updates: only force update occasionally to avoid too many re-renders
            if (chunkEventCount % 5 === 0 || chunkEventCount === chunk.length) {
              forceUpdate(prev => prev + 1)
            }
          }
        },
        complete: () => {
          // Final update to ensure all loaded videos are shown
          forceUpdate(prev => prev + 1)
          checkComplete()
        },
        error: err => {
          console.error('Error loading video event:', err)
          checkComplete()
        },
      })
    })

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe())
      loadingRef.current = false
    }
    // Only depend on the stable string, but use likedEventIds inside the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likedIdsString, eventStore, pool])

  const isLoading = isLoadingReactions || loadingVideos

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <div className="text-2xl font-semibold mb-4">{t('pages.likedVideos.title')}</div>

      {isLoading && videos.length === 0 ? (
        <VideoGridSkeleton count={8} />
      ) : (
        <>
          <VideoGrid videos={videos} isLoading={false} showSkeletons={false} layoutMode="auto" />

          {videos.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t('pages.likedVideos.noVideos')}</p>
              <p className="text-sm mt-2">{t('pages.likedVideos.emptyState')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

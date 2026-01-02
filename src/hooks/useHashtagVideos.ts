import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppContext } from './useAppContext'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { processEvent, deduplicateByIdentifier, type VideoEvent } from '@/utils/video-event'
import type { NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools/filter'

interface UseHashtagVideosOptions {
  tag: string | undefined
  relays: string[]
  videoKinds: number[]
}

interface UseHashtagVideosResult {
  videos: VideoEvent[]
  loading: boolean
  loadingLabels: boolean
  loadMore: () => void
}

/**
 * Hook to load videos by hashtag, including both native tags and NIP-32 labels
 *
 * Query strategy:
 * 1. Query videos with native #t tags (immediate, blocking)
 * 2. Query kind 1985 label events with hashtag (background)
 * 3. Extract e tags from labels and fetch those videos (background)
 * 4. Merge and deduplicate by event ID, sort by timestamp
 */
export function useHashtagVideos({
  tag,
  relays,
  videoKinds,
}: UseHashtagVideosOptions): UseHashtagVideosResult {
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()

  // Phase 1: Native videos with #t tags
  const [nativeVideos, setNativeVideos] = useState<VideoEvent[]>([])
  const [loading, setLoading] = useState(true)

  // Phase 2 & 3: Label events and labeled videos
  const [labeledVideoIds, setLabeledVideoIds] = useState<Set<string>>(new Set())
  const [labeledVideos, setLabeledVideos] = useState<VideoEvent[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)

  // Track if we've started label queries
  const labelQueriesStarted = useRef(false)
  // Track if Phase 1 has ever completed (allows Phase 2 to start even if Phase 1 restarts)
  const phase1CompletedOnce = useRef(false)
  // Capture relays when Phase 1 completes to ensure Phase 2 uses same relays
  const phase1Relays = useRef<string[]>([])

  // Reset state when tag changes
  useEffect(() => {
    queueMicrotask(() => {
      setNativeVideos([])
      setLabeledVideoIds(new Set())
      setLabeledVideos([])
      setLoading(true)
      setLoadingLabels(false)
      labelQueriesStarted.current = false
      phase1CompletedOnce.current = false
      phase1Relays.current = []
    })
  }, [tag])

  // Phase 1: Query native videos with #t tags
  useEffect(() => {
    console.log('[useHashtagVideos] Phase 1 effect triggered', {
      tag,
      hasPool: !!pool,
      relayCount: relays?.length,
      videoKindsLength: videoKinds?.length,
    })

    if (!tag || !pool || !relays || relays.length === 0) {
      console.log('[useHashtagVideos] Phase 1 guard blocked, setting loading=false')
      queueMicrotask(() => setLoading(false))
      return
    }

    console.log('[useHashtagVideos] Phase 1 starting query, setting loading=true')
    queueMicrotask(() => setLoading(true))
    const processedVideos: VideoEvent[] = []

    const filters: Filter[] = [
      {
        kinds: videoKinds,
        '#t': [tag.toLowerCase()],
        limit: 50,
      },
    ]

    console.log('[useHashtagVideos] Phase 1 filters:', filters)
    const loader = createTimelineLoader(pool, relays, filters, { eventStore })

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        const processed = processEvent(event, [], config.blossomServers)
        if (processed) {
          processedVideos.push(processed)
        }
      },
      error: err => {
        console.error('Error loading native videos:', err)
        queueMicrotask(() => setLoading(false))
      },
    })

    // Wait for initial batch to load
    const timeout = setTimeout(() => {
      console.log(
        '[useHashtagVideos] Phase 1 timeout fired. Found',
        processedVideos.length,
        'native videos'
      )
      setNativeVideos(processedVideos)
      console.log(
        '[useHashtagVideos] Phase 1 setting loading=false and marking phase1CompletedOnce=true'
      )
      console.log('[useHashtagVideos] Phase 1 capturing relays for Phase 2:', relays)
      phase1CompletedOnce.current = true
      phase1Relays.current = relays // Capture relays for Phase 2
      queueMicrotask(() => setLoading(false))
    }, 2000)

    return () => {
      console.log('[useHashtagVideos] Phase 1 cleanup - clearing timeout and unsubscribing')
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [tag, pool, relays, videoKinds, eventStore, config.blossomServers])

  // Phase 2: Query label events (background, after native results)
  useEffect(() => {
    console.log('[useHashtagVideos] Phase 2 effect triggered', {
      tag,
      hasPool: !!pool,
      relayCount: relays?.length,
      loading,
      phase1CompletedOnce: phase1CompletedOnce.current,
      labelQueriesStarted: labelQueriesStarted.current,
    })

    // Only start label queries if Phase 1 has completed at least once and we haven't started yet
    // Allow starting even if loading=true (Phase 1 might have restarted due to relay changes)
    if (
      !tag ||
      !pool ||
      !relays ||
      relays.length === 0 ||
      !phase1CompletedOnce.current ||
      labelQueriesStarted.current
    ) {
      console.log('[useHashtagVideos] Phase 2 guard blocked:', {
        noTag: !tag,
        noPool: !pool,
        noRelays: !relays || relays.length === 0,
        phase1NotCompleted: !phase1CompletedOnce.current,
        alreadyStarted: labelQueriesStarted.current,
      })
      return
    }

    console.log('[useHashtagVideos] Phase 2 starting debounce timer (500ms)...')

    // Debounce: wait 500ms after native results loaded
    const debounceTimer = setTimeout(() => {
      console.log(
        '[useHashtagVideos] Phase 2 debounce complete, starting label query for tag:',
        tag
      )
      labelQueriesStarted.current = true
      queueMicrotask(() => setLoadingLabels(true))

      const labelEvents: NostrEvent[] = []

      // NIP-32 label events use L (namespace) and l (label value) tags
      // For hashtags: L="#t" (namespace), l=<tag> (the actual hashtag)
      const filter: Filter = {
        kinds: [1985], // NIP-32 label events
        '#L': ['#t'], // Namespace for hashtags
        '#l': [tag.toLowerCase()], // The actual label value
        limit: 100, // Reasonable cap
      }

      console.log('[useHashtagVideos] Phase 2 filter:', filter)
      // Use the same relays that Phase 1 used (captured when Phase 1 completed)
      const queryRelays = phase1Relays.current
      console.log('[useHashtagVideos] Phase 2 relays being queried (from Phase 1):', queryRelays)
      // Use pool.req() directly to ensure REQ is sent to relays
      console.log(
        '[useHashtagVideos] Phase 2 calling pool.req() with',
        queryRelays.length,
        'relays'
      )
      const subscription = pool.req(queryRelays, filter).subscribe({
        next: (response: NostrEvent | 'EOSE') => {
          if (response === 'EOSE') {
            console.log('[useHashtagVideos] Phase 2 received EOSE from a relay')
            return
          }
          console.log('[useHashtagVideos] Phase 2 received label event:', response.id)
          // Add to EventStore for caching
          eventStore.add(response)
          labelEvents.push(response)
        },
        complete: () => {
          console.log('[useHashtagVideos] Phase 2 subscription completed (all relays EOSE)')
        },
        error: err => {
          console.error('Error loading label events:', err)
          queueMicrotask(() => setLoadingLabels(false))
        },
      })

      // Wait for label events to load, then extract video IDs
      const timeout = setTimeout(() => {
        console.log(
          '[useHashtagVideos] Phase 2 timeout complete. Found',
          labelEvents.length,
          'label events'
        )
        const videoIds = extractVideoIdsFromLabels(labelEvents)
        console.log('[useHashtagVideos] Phase 2 extracted', videoIds.size, 'video IDs')
        setLabeledVideoIds(videoIds)
        subscription.unsubscribe()
      }, 2000)

      return () => {
        clearTimeout(timeout)
        subscription.unsubscribe()
      }
    }, 500)

    return () => clearTimeout(debounceTimer)
  }, [tag, pool, relays, eventStore, loading])

  // Phase 3: Fetch labeled videos by ID
  useEffect(() => {
    if (labeledVideoIds.size === 0 || !pool || !relays || relays.length === 0) {
      if (labeledVideoIds.size === 0 && labelQueriesStarted.current) {
        queueMicrotask(() => setLoadingLabels(false))
      }
      return
    }

    const fetchLabeledVideos = async () => {
      const videoIdsArray = Array.from(labeledVideoIds)
      const fetchedVideos: VideoEvent[] = []

      // Batch fetch in groups of 20 to avoid overwhelming relays
      const batchSize = 20
      for (let i = 0; i < videoIdsArray.length; i += batchSize) {
        const batch = videoIdsArray.slice(i, i + batchSize)

        const filters: Filter[] = [
          {
            kinds: videoKinds,
            ids: batch,
          },
        ]

        const loader = createTimelineLoader(pool, relays, filters, { eventStore })

        await new Promise<void>(resolve => {
          const subscription = loader().subscribe({
            next: (event: NostrEvent) => {
              const processed = processEvent(event, [], config.blossomServers)
              if (processed) {
                fetchedVideos.push(processed)
              }
            },
            error: err => {
              console.error('Error fetching labeled videos:', err)
              resolve()
            },
          })

          // Wait for batch to complete
          setTimeout(() => {
            subscription.unsubscribe()
            resolve()
          }, 1500)
        })
      }

      setLabeledVideos(fetchedVideos)
      queueMicrotask(() => setLoadingLabels(false))
    }

    fetchLabeledVideos()
  }, [labeledVideoIds, pool, relays, videoKinds, eventStore, config.blossomServers])

  // Merge and deduplicate videos
  const mergedVideos = useMemo(() => {
    // Use Map for O(1) deduplication by event ID
    const videoMap = new Map<string, VideoEvent>()

    // Add native videos first
    nativeVideos.forEach(video => {
      videoMap.set(video.id, video)
    })

    // Add labeled videos (skip if already exists by ID)
    labeledVideos.forEach(video => {
      if (!videoMap.has(video.id)) {
        videoMap.set(video.id, video)
      }
    })

    // Deduplicate by identifier (same video posted as both addressable and regular events)
    const deduplicated = deduplicateByIdentifier(Array.from(videoMap.values()))

    // Sort by timestamp descending (newest first)
    return deduplicated.sort((a, b) => b.created_at - a.created_at)
  }, [nativeVideos, labeledVideos])

  // Load more function (currently no-op, can be extended for pagination)
  const loadMore = () => {
    // Future: Implement pagination for both native and labeled videos
  }

  return {
    videos: mergedVideos,
    loading,
    loadingLabels,
    loadMore,
  }
}

/**
 * Extract video event IDs from label events
 * Looks for 'e' tags in kind 1985 events
 */
function extractVideoIdsFromLabels(labelEvents: NostrEvent[]): Set<string> {
  const videoIds = new Set<string>()

  labelEvents.forEach(event => {
    event.tags.forEach(tag => {
      // Extract e tags (event references)
      if (tag[0] === 'e' && tag[1]) {
        videoIds.add(tag[1])
      }
    })
  })

  return videoIds
}

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAppContext } from './useAppContext'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import {
  processEvent,
  processEvents,
  deduplicateByIdentifier,
  type VideoEvent,
} from '@/utils/video-event'
import { useSelectedPreset } from './useSelectedPreset'
import { useReportedPubkeys } from './useReportedPubkeys'
import type { NostrEvent } from 'nostr-tools'
import type { Filter } from 'nostr-tools/filter'
import { of } from 'rxjs'

interface UseHashtagVideosOptions {
  tag: string | undefined
  relays: string[]
  videoKinds: number[]
  limit?: number // Optional limit for pagination (default: 50)
}

interface UseHashtagVideosResult {
  videos: VideoEvent[]
  loading: boolean
  loadingLabels: boolean
  exhausted: boolean
  loadMore: () => void
}

/**
 * Hook to load videos by hashtag, including both native tags and NIP-32 labels
 *
 * Query strategy:
 * 1. Query videos with native #t tags (reactive via use$)
 * 2. Query kind 1985 label events with hashtag (background)
 * 3. Extract e tags from labels and fetch those videos (background)
 * 4. Merge and deduplicate by event ID, sort by timestamp
 * 5. Supports infinite scroll pagination via loadMore
 */
export function useHashtagVideos({
  tag,
  relays,
  videoKinds,
  limit = 50,
}: UseHashtagVideosOptions): UseHashtagVideosResult {
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()

  // Phase 1: Native videos with #t tags (reactive via use$)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [exhausted, setExhausted] = useState(false)

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

  // Build filter for Phase 1 EventStore subscription
  const nativeFilter = useMemo((): Filter | null => {
    if (!tag) return null
    return {
      kinds: videoKinds,
      '#t': [tag.toLowerCase()],
    }
  }, [tag, videoKinds])

  // Subscribe to EventStore for reactive updates (Phase 1)
  const nativeEvents = use$(() => {
    if (!nativeFilter) return of([])
    return eventStore.timeline(nativeFilter)
  }, [eventStore, nativeFilter])

  // Process native events
  const nativeVideos = useMemo(() => {
    const eventList = nativeEvents ?? []
    return processEvents(
      eventList,
      relays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )
  }, [nativeEvents, relays, blockedPubkeys, config.blossomServers, presetContent.nsfwPubkeys])

  // Reset state when tag changes
  useEffect(() => {
    queueMicrotask(() => {
      setHasLoaded(false)
      setLoading(true)
      setExhausted(false)
      setLabeledVideoIds(new Set())
      setLabeledVideos([])
      setLoadingLabels(false)
    })
    labelQueriesStarted.current = false
    phase1CompletedOnce.current = false
    phase1Relays.current = []
  }, [tag])

  // Phase 1: Load native videos from relays into EventStore
  useEffect(() => {
    if (!tag || !pool || !relays || relays.length === 0 || !nativeFilter || hasLoaded) {
      if (!nativeFilter) queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))

    const loader = createTimelineLoader(pool, relays, nativeFilter, { eventStore, limit })

    let eventCount = 0
    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
        eventCount++
      },
      complete: () => {
        phase1CompletedOnce.current = true
        phase1Relays.current = relays
        setLoading(false)
        setHasLoaded(true)
        // If we got fewer events than the limit, we're exhausted
        if (eventCount < limit) {
          setExhausted(true)
        }
      },
      error: err => {
        console.error('Error loading native videos:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [tag, pool, relays, nativeFilter, eventStore, hasLoaded, limit])

  // Phase 2: Query label events (background, after Phase 1 completes)
  useEffect(() => {
    // Only start label queries if Phase 1 has completed at least once and we haven't started yet
    if (
      !tag ||
      !pool ||
      !phase1CompletedOnce.current ||
      labelQueriesStarted.current ||
      phase1Relays.current.length === 0
    ) {
      return
    }

    // Debounce: wait 500ms after Phase 1 completes
    const debounceTimer = setTimeout(() => {
      labelQueriesStarted.current = true
      setLoadingLabels(true)

      const labelEvents: NostrEvent[] = []

      // NIP-32 label events use L (namespace) and l (label value) tags
      const filter: Filter = {
        kinds: [1985], // NIP-32 label events
        '#L': ['#t'], // Namespace for hashtags
        '#l': [tag.toLowerCase()], // The actual label value
        limit: 100,
      }

      const queryRelays = phase1Relays.current
      const subscription = pool.req(queryRelays, filter).subscribe({
        next: (response: NostrEvent | 'EOSE') => {
          if (response === 'EOSE') return
          eventStore.add(response)
          labelEvents.push(response)
        },
        error: err => {
          console.error('Error loading label events:', err)
          setLoadingLabels(false)
        },
      })

      // Wait for label events to load, then extract video IDs
      const timeout = setTimeout(() => {
        const videoIds = extractVideoIdsFromLabels(labelEvents)
        setLabeledVideoIds(videoIds)
        subscription.unsubscribe()
      }, 2000)

      return () => {
        clearTimeout(timeout)
        subscription.unsubscribe()
      }
    }, 500)

    return () => clearTimeout(debounceTimer)
  }, [tag, pool, eventStore, hasLoaded])

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
              const processed = processEvent(
                event,
                [],
                config.blossomServers,
                presetContent.nsfwPubkeys
              )
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
  }, [
    labeledVideoIds,
    pool,
    relays,
    videoKinds,
    eventStore,
    config.blossomServers,
    presetContent.nsfwPubkeys,
  ])

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

  // Load more videos (pagination for native videos)
  const loadMore = useCallback(() => {
    if (!nativeFilter || !pool || loading || exhausted || mergedVideos.length === 0) return

    setLoading(true)

    // Get the oldest native video timestamp for pagination
    // We use merged videos since that's what's displayed, but filter for native ones
    const oldestVideo = mergedVideos[mergedVideos.length - 1]
    const until = oldestVideo.created_at

    const paginatedFilter = { ...nativeFilter, until }
    const loader = createTimelineLoader(pool, relays, paginatedFilter, { eventStore, limit })

    let eventCount = 0
    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventStore.add(event)
        eventCount++
      },
      complete: () => {
        setLoading(false)
        // If we got fewer events than the limit, we're exhausted
        if (eventCount < limit) {
          setExhausted(true)
        }
      },
      error: err => {
        console.error('Error loading more hashtag videos:', err)
        setLoading(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [nativeFilter, pool, relays, eventStore, loading, exhausted, mergedVideos, limit])

  return {
    videos: mergedVideos,
    loading,
    loadingLabels,
    exhausted,
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

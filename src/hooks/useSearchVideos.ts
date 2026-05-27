import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import MiniSearch from 'minisearch'
import { processEvents, getPublishDate } from '@/utils/video-event'
import { useAppContext, useReportedPubkeys, useReadRelays } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { type NostrEvent, kinds, nip19 } from 'nostr-tools'
import type { VideoEvent, VideoVariant } from '@/utils/video-event'
import { relayPool } from '@/nostr/core'
import type { IEventStore } from 'applesauce-core'
import { getTypeForKind } from '@/lib/video-types'

// Search configuration
const SEARCH_LIMIT = 1000 // Max events to load from relays
const VIDEO_KINDS = [21, 22, 34235, 34236]
const EXTERNAL_SEARCH_URL = 'https://nostube-search.apps2.slidestr.net'
const EXTERNAL_SEARCH_TIMEOUT_MS = 5000

function extractHashtags(text: string): string[] {
  const hashtagRegex = /#(\w+)/g
  const matches = text.match(hashtagRegex)
  return matches ? matches.map(match => match.substring(1)) : []
}

// MiniSearch instance - shared across searches for efficiency
let searchIndex: MiniSearch<IndexedVideo> | null = null
const indexedEventIds = new Set<string>()

interface IndexedVideo {
  id: string
  title: string
  description: string
  tags: string
  authorName?: string
}

interface ExternalSearchHit {
  event_id: string
  title: string
  content_preview: string
  pubkey: string
  kind: number
  created_at: number
  thumbnail: string | null
  videoUrl: string | null
  tags: string[]
  authorDisplayName: string | null
  rankingScore: number
  nostrUrl: string
}

function mapExternalHitToVideoEvent(hit: ExternalSearchHit): VideoEvent {
  const type = getTypeForKind(hit.kind)
  const videoVariants: VideoVariant[] = hit.videoUrl
    ? [{ url: hit.videoUrl, fallbackUrls: [] }]
    : []
  const thumbnailVariants: VideoVariant[] = hit.thumbnail
    ? [{ url: hit.thumbnail, fallbackUrls: [], mediaType: 'image' as const }]
    : []
  return {
    id: hit.event_id,
    kind: hit.kind,
    title: hit.title,
    description: hit.content_preview,
    images: hit.thumbnail ? [hit.thumbnail] : [],
    pubkey: hit.pubkey,
    created_at: hit.created_at,
    duration: 0,
    tags: Array.isArray(hit.tags) ? hit.tags : [],
    searchText: `${hit.title} ${hit.content_preview}`,
    urls: hit.videoUrl ? [hit.videoUrl] : [],
    link: nip19.neventEncode({ kind: hit.kind, id: hit.event_id, author: hit.pubkey, relays: [] }),
    type,
    textTracks: [],
    contentWarning: undefined,
    origins: [],
    videoVariants,
    thumbnailVariants,
  }
}

async function fetchExternalSearchResults(
  query: string,
  signal: AbortSignal
): Promise<VideoEvent[] | null> {
  try {
    const url = `${EXTERNAL_SEARCH_URL}/api/search?q=${encodeURIComponent(query)}&limit=50`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as { hits: ExternalSearchHit[] }
    return (data.hits ?? []).map(mapExternalHitToVideoEvent)
  } catch {
    return null
  }
}

function getSearchIndex(): MiniSearch<IndexedVideo> {
  if (!searchIndex) {
    searchIndex = new MiniSearch<IndexedVideo>({
      fields: ['title', 'description', 'tags', 'authorName'],
      storeFields: ['id'],
      searchOptions: {
        boost: { title: 3, tags: 2, description: 1, authorName: 0.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    })
  }
  return searchIndex
}

function getAuthorName(pubkey: string, eventStore: IEventStore): string | undefined {
  try {
    const profileEvent = eventStore.getReplaceable(kinds.Metadata, pubkey)
    if (profileEvent) {
      const profile = JSON.parse(profileEvent.content)
      return profile.display_name || profile.name || undefined
    }
  } catch {
    // ignore
  }
  return undefined
}

function extractSearchableFields(event: NostrEvent, eventStore: IEventStore): IndexedVideo {
  const title = event.tags.find(t => t[0] === 'title')?.[1] || ''
  const description =
    event.tags.find(t => t[0] === 'summary')?.[1] || event.tags.find(t => t[0] === 'alt')?.[1] || ''
  const hashtags = event.tags
    .filter(t => t[0] === 't')
    .map(t => t[1])
    .join(' ')
  const authorName = getAuthorName(event.pubkey, eventStore)
  return { id: event.id, title, description, tags: hashtags, authorName }
}

function indexEvents(events: NostrEvent[], eventStore: IEventStore): void {
  const index = getSearchIndex()
  const newDocs: IndexedVideo[] = []
  for (const event of events) {
    if (!indexedEventIds.has(event.id)) {
      indexedEventIds.add(event.id)
      newDocs.push(extractSearchableFields(event, eventStore))
    }
  }
  if (newDocs.length > 0) {
    index.addAll(newDocs)
  }
}

function searchIndexForQuery(query: string): Set<string> {
  const index = getSearchIndex()
  const results = index.search(query)
  return new Set(results.map(r => r.id))
}

interface UseSearchVideosOptions {
  query: string | null
  kinds?: number[]
  limit?: number
}

export function useSearchVideos({
  query,
  kinds = VIDEO_KINDS,
  limit = SEARCH_LIMIT,
}: UseSearchVideosOptions): {
  videos: VideoEvent[]
  loading: boolean
  hasLoaded: boolean
  loadMore: () => void
} {
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const { presetContent } = useSelectedPreset()
  const readRelays = useReadRelays()

  // External search state
  const [externalVideos, setExternalVideos] = useState<VideoEvent[] | null>(null)
  const [externalLoading, setExternalLoading] = useState(false)
  const [externalFailed, setExternalFailed] = useState(false)

  // Local search state (fallback)
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [matchingIds, setMatchingIds] = useState<Set<string>>(new Set())
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([])
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)
  const hasFetchedRef = useRef(false)

  // External search: try the remote API first
  useEffect(() => {
    if (!query) {
      setExternalVideos(null)
      setExternalFailed(false)
      setExternalLoading(false)
      return
    }

    setExternalVideos(null)
    setExternalFailed(false)
    setExternalLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_SEARCH_TIMEOUT_MS)

    fetchExternalSearchResults(query, controller.signal).then(results => {
      clearTimeout(timeoutId)
      if (controller.signal.aborted) return
      if (results !== null) {
        setExternalVideos(results)
      } else {
        setExternalFailed(true)
      }
      setExternalLoading(false)
    })

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query])

  // Local fallback: index events already in IEventStore when external fails
  useEffect(() => {
    if (!externalFailed || !query) {
      queueMicrotask(() => setMatchingIds(new Set()))
      return
    }

    const storeEvents: NostrEvent[] = []
    const timeline = eventStore.timeline({ kinds })
    const sub = timeline.subscribe({
      next: events => {
        if (events && events.length > 0) storeEvents.push(...events)
      },
    })

    queueMicrotask(() => {
      sub.unsubscribe()
      if (storeEvents.length > 0) {
        indexEvents(storeEvents, eventStore)
        setAllEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const newEvents = storeEvents.filter(e => !existingIds.has(e.id))
          if (newEvents.length === 0) return prev
          return [...prev, ...newEvents]
        })
        const matches = searchIndexForQuery(query)
        setMatchingIds(matches)
      }
    })
  }, [query, kinds, eventStore, externalFailed])

  // Local fallback: fetch from relays when external fails
  useEffect(() => {
    if (!externalFailed) return
    if (!query || hasFetchedRef.current) return
    if (readRelays.length === 0) return

    hasFetchedRef.current = true
    setLoading(true)

    const hashtags = extractHashtags(query)
    const filters: { kinds: number[]; limit: number; search?: string; '#t'?: string[] }[] = []
    filters.push({ kinds, limit })

    const nonHashtagQuery = query.replace(/#(\w+)/g, '').trim()
    if (nonHashtagQuery.length > 0) {
      filters.push({ kinds, limit, search: nonHashtagQuery })
    }
    if (hashtags.length > 0) {
      filters.push({ kinds, limit, '#t': hashtags })
    }

    if (import.meta.env.DEV) {
      console.log(`🔍 External search failed, fetching from relays with filters:`, filters)
    }

    const loader = createTimelineLoader(relayPool, readRelays, filters, { eventStore })
    let eventCount = 0

    const timeoutId = setTimeout(() => {
      setLoading(false)
      setHasLoaded(true)
      subscriptionRef.current?.unsubscribe()
    }, 10000)

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventCount++
        eventStore.add(event)
        indexEvents([event], eventStore)
        setAllEvents(prev => {
          if (prev.some(e => e.id === event.id)) return prev
          return [...prev, event]
        })
        if (eventCount % 50 === 0 && query) {
          const matches = searchIndexForQuery(query)
          setMatchingIds(matches)
        }
      },
      complete: () => {
        clearTimeout(timeoutId)
        setLoading(false)
        setHasLoaded(true)
        if (query) {
          const matches = searchIndexForQuery(query)
          setMatchingIds(matches)
        }
      },
      error: err => {
        clearTimeout(timeoutId)
        console.error('Error fetching videos for search:', err)
        setLoading(false)
        setHasLoaded(true)
      },
    })

    subscriptionRef.current = subscription

    return () => {
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [query, readRelays, eventStore, kinds, limit, externalFailed])

  // Re-search local index when query changes (after initial load, fallback only)
  useEffect(() => {
    if (!externalFailed || !query) {
      queueMicrotask(() => setMatchingIds(new Set()))
      return
    }
    if (indexedEventIds.size > 0) {
      queueMicrotask(() => {
        const matches = searchIndexForQuery(query)
        setMatchingIds(matches)
      })
    }
  }, [query, externalFailed])

  // Reset local search state when query changes
  useEffect(() => {
    hasFetchedRef.current = false
    setAllEvents([])
    setMatchingIds(new Set())
    setHasLoaded(false)
    setLoading(false)
  }, [query])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
    }
  }, [])

  // Local search result processing (fallback)
  const localVideos = useMemo(() => {
    if (!query || matchingIds.size === 0) return []
    const matchingEvents = allEvents.filter(e => matchingIds.has(e.id))
    const processed = processEvents(
      matchingEvents,
      readRelays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys,
      config.reportedEventIds,
      { includeYouTube: config.showYouTubeContent ?? true }
    )
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [
    query,
    matchingIds,
    allEvents,
    readRelays,
    blockedPubkeys,
    config.blossomServers,
    presetContent.nsfwPubkeys,
    config.reportedEventIds,
    config.showYouTubeContent,
  ])

  // Filter external results by blocked pubkeys
  const filteredExternalVideos = useMemo(() => {
    if (!externalVideos) return []
    return externalVideos.filter(v => !blockedPubkeys?.[v.pubkey])
  }, [externalVideos, blockedPubkeys])

  const loadMore = useCallback(() => {}, [])

  // Return external results when available, otherwise fall back to local
  if (externalVideos !== null) {
    return { videos: filteredExternalVideos, loading: false, hasLoaded: true, loadMore }
  }

  if (externalLoading) {
    return { videos: [], loading: true, hasLoaded: false, loadMore }
  }

  // externalFailed: return local search results
  return { videos: localVideos, loading, hasLoaded, loadMore }
}

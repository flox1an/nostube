import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import MiniSearch from 'minisearch'
import { processEvents, getPublishDate } from '@/utils/video-event'
import { useAppContext, useReportedPubkeys, useReadRelays } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { type NostrEvent, kinds } from 'nostr-tools'
import type { VideoEvent } from '@/utils/video-event'
import { relayPool } from '@/nostr/core'
import type { IEventStore } from 'applesauce-core'

// Search configuration
const SEARCH_LIMIT = 1000 // Max events to load from relays
const VIDEO_KINDS = [21, 22, 34235, 34236]

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

/**
 * Create or get the MiniSearch index
 */
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

/**
 * Get author display name from profile in IEventStore
 */
function getAuthorName(pubkey: string, eventStore: IEventStore): string | undefined {
  try {
    // Try to get the profile event from the store
    const profileEvent = eventStore.getReplaceable(kinds.Metadata, pubkey)
    if (profileEvent) {
      const profile = JSON.parse(profileEvent.content)
      return profile.display_name || profile.name || undefined
    }
  } catch {
    // Profile not found or invalid JSON
  }
  return undefined
}

/**
 * Extract searchable text from a Nostr event
 */
function extractSearchableFields(event: NostrEvent, eventStore: IEventStore): IndexedVideo {
  const title = event.tags.find(t => t[0] === 'title')?.[1] || ''
  const description =
    event.tags.find(t => t[0] === 'summary')?.[1] || event.tags.find(t => t[0] === 'alt')?.[1] || ''
  const hashtags = event.tags
    .filter(t => t[0] === 't')
    .map(t => t[1])
    .join(' ')
  const authorName = getAuthorName(event.pubkey, eventStore)

  return {
    id: event.id,
    title,
    description,
    tags: hashtags,
    authorName,
  }
}

/**
 * Add events to the search index
 */
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

/**
 * Search the index and return matching event IDs
 */
function searchIndexForQuery(query: string): Set<string> {
  const index = getSearchIndex()
  const results = index.search(query)
  return new Set(results.map(r => r.id))
}

interface UseSearchVideosOptions {
  /**
   * Search query string
   */
  query: string | null

  /**
   * Video kinds to search (default: all video kinds)
   */
  kinds?: number[]

  /**
   * Optional limit for relay fetch (default: 1000)
   */
  limit?: number
}

/**
 * Hook for searching videos using client-side full-text search with MiniSearch.
 * Hybrid approach:
 * 1. Immediately search events already in IEventStore
 * 2. Fetch more events from relays (without NIP-50)
 * 3. Index and search progressively as events arrive
 *
 * @example
 * const { videos, loading, loadMore } = useSearchVideos({ query: 'bitcoin' })
 */
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
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [matchingIds, setMatchingIds] = useState<Set<string>>(new Set())
  const [allEvents, setAllEvents] = useState<NostrEvent[]>([])
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)
  const hasFetchedRef = useRef(false)

  // Index events already in IEventStore and search immediately when query changes
  useEffect(() => {
    if (!query) {
      queueMicrotask(() => setMatchingIds(new Set()))
      return
    }

    // Get events from IEventStore synchronously if available
    const storeEvents: NostrEvent[] = []
    const timeline = eventStore.timeline({ kinds })

    // Subscribe briefly to get current events
    const sub = timeline.subscribe({
      next: events => {
        if (events && events.length > 0) {
          storeEvents.push(...events)
        }
      },
    })

    // Unsubscribe after getting initial batch
    queueMicrotask(() => {
      sub.unsubscribe()

      if (storeEvents.length > 0) {
        // Index the events
        indexEvents(storeEvents, eventStore)
        setAllEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const newEvents = storeEvents.filter(e => !existingIds.has(e.id))
          if (newEvents.length === 0) return prev
          return [...prev, ...newEvents]
        })

        // Search and update matching IDs
        const matches = searchIndexForQuery(query)
        setMatchingIds(matches)
      }
    })
  }, [query, kinds, eventStore])

  // Fetch events from relays on first search
  useEffect(() => {
    if (!query || hasFetchedRef.current) return
    if (readRelays.length === 0) return

    hasFetchedRef.current = true
    setLoading(true)

    const hashtags = extractHashtags(query)

    const filters: { kinds: number[]; limit: number; search?: string; '#t'?: string[] }[] = []

    // Filter 1: Latest events (always include)
    filters.push({ kinds, limit })

    // Filter 2: NIP-50 search (if query has non-hashtag part)
    const nonHashtagQuery = query.replace(/#(\w+)/g, '').trim()
    if (nonHashtagQuery.length > 0) {
      filters.push({ kinds, limit, search: nonHashtagQuery })
    }

    // Filter 3: Tag search (if hashtags are present)
    if (hashtags.length > 0) {
      filters.push({ kinds, limit, '#t': hashtags })
    }

    if (import.meta.env.DEV) {
      console.log(
        `🔍 Fetching up to ${limit} video events for search indexing with filters:`,
        filters
      )
    }

    const loader = createTimelineLoader(relayPool, readRelays, filters, { eventStore })
    let eventCount = 0

    // Set a timeout to mark loading as complete (relay subscriptions often don't "complete")
    const timeoutId = setTimeout(() => {
      setLoading(false)
      setHasLoaded(true)
      subscriptionRef.current?.unsubscribe()
      if (import.meta.env.DEV) {
        console.log(`🔍 Search timeout reached. Index has ${indexedEventIds.size} events`)
      }
    }, 10000) // 10 second timeout

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        eventCount++

        // Add to IEventStore
        eventStore.add(event)

        // Index the event
        indexEvents([event], eventStore)

        // Update allEvents
        setAllEvents(prev => {
          if (prev.some(e => e.id === event.id)) return prev
          return [...prev, event]
        })

        // Update search results periodically (every 50 events) for progressive display
        if (eventCount % 50 === 0 && query) {
          const matches = searchIndexForQuery(query)
          setMatchingIds(matches)
        }
      },
      complete: () => {
        clearTimeout(timeoutId)
        setLoading(false)
        setHasLoaded(true)

        // Re-run search with current query after all events loaded
        if (query) {
          const matches = searchIndexForQuery(query)
          setMatchingIds(matches)
          if (import.meta.env.DEV) {
            console.log(`🔍 Search complete. Index has ${indexedEventIds.size} events`)
          }
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
  }, [query, readRelays, eventStore, kinds, limit])

  // Re-search when query changes (after initial load)
  useEffect(() => {
    if (!query) {
      queueMicrotask(() => setMatchingIds(new Set()))
      return
    }

    // Search existing index immediately
    if (indexedEventIds.size > 0) {
      queueMicrotask(() => {
        const matches = searchIndexForQuery(query)
        setMatchingIds(matches)
      })
    }
  }, [query])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe()
    }
  }, [])

  // Filter and process matching events
  const videos = useMemo(() => {
    if (!query || matchingIds.size === 0) return []

    // Filter events to only matching ones
    const matchingEvents = allEvents.filter(e => matchingIds.has(e.id))

    // Process into VideoEvent format
    const processed = processEvents(
      matchingEvents,
      readRelays,
      blockedPubkeys,
      config.blossomServers,
      undefined,
      presetContent.nsfwPubkeys
    )

    // Sort by publish date descending (newest first)
    return processed.sort((a, b) => getPublishDate(b) - getPublishDate(a))
  }, [
    query,
    matchingIds,
    allEvents,
    readRelays,
    blockedPubkeys,
    config.blossomServers,
    presetContent.nsfwPubkeys,
  ])

  // Load more is a no-op for now since we load all at once
  const loadMore = useCallback(() => {
    // Could implement pagination in the future
  }, [])

  return {
    videos,
    loading,
    hasLoaded,
    loadMore,
  }
}

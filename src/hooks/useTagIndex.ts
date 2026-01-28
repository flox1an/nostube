import { useState, useEffect, useCallback } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import type { NostrEvent } from 'nostr-tools'

const VIDEO_KINDS = [21, 22, 34235, 34236]

export interface TagIndexEntry {
  tag: string
  count: number
}

// Singleton tag index - tag -> count
const tagCounts = new Map<string, number>()
const indexedEventIds = new Set<string>()
let isInitialized = false

/**
 * Extract and index tags from video events
 */
function indexVideoEvents(events: NostrEvent[]): void {
  for (const event of events) {
    if (indexedEventIds.has(event.id)) continue
    indexedEventIds.add(event.id)

    // Extract 't' tags
    const tags = event.tags
      .filter(t => t[0] === 't' && t[1])
      .map(t => t[1].toLowerCase().trim())
      .filter(t => t.length > 0)

    // Update counts
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
  }
}

/**
 * Search tags by prefix, sorted by frequency
 */
function searchTags(query: string, limit = 8): TagIndexEntry[] {
  if (!query) return []

  const normalizedQuery = query.toLowerCase().trim().replace(/^#/, '')
  if (!normalizedQuery) return []

  const matches: TagIndexEntry[] = []

  for (const [tag, count] of tagCounts) {
    if (tag.startsWith(normalizedQuery)) {
      matches.push({ tag, count })
    }
  }

  // Sort by count descending, then alphabetically
  matches.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.tag.localeCompare(b.tag)
  })

  return matches.slice(0, limit)
}

/**
 * Get all tags sorted by frequency
 */
function getAllTags(): TagIndexEntry[] {
  const entries: TagIndexEntry[] = []
  for (const [tag, count] of tagCounts) {
    entries.push({ tag, count })
  }
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.tag.localeCompare(b.tag)
  })
  return entries
}

/**
 * Hook to access the tag index with autocomplete functionality
 */
export function useTagIndex(): {
  searchTags: (query: string, limit?: number) => TagIndexEntry[]
  getAllTags: () => TagIndexEntry[]
  isReady: boolean
  tagCount: number
} {
  const eventStore = useEventStore()
  const [isReady, setIsReady] = useState(isInitialized)
  const [tagCount, setTagCount] = useState(tagCounts.size)

  // Initialize index from event store on first use
  useEffect(() => {
    if (isInitialized) return

    const timeline = eventStore.timeline({ kinds: VIDEO_KINDS })
    const events: NostrEvent[] = []

    const sub = timeline.subscribe({
      next: batch => {
        if (batch && batch.length > 0) {
          events.push(...batch)
        }
      },
    })

    // Process after initial batch
    queueMicrotask(() => {
      sub.unsubscribe()

      if (events.length > 0) {
        indexVideoEvents(events)
        if (import.meta.env.DEV) {
          console.log(
            `🏷️ Tag index initialized: ${tagCounts.size} unique tags from ${indexedEventIds.size} events`
          )
        }
      }

      isInitialized = true
      setIsReady(true)
      setTagCount(tagCounts.size)
    })
  }, [eventStore])

  // Subscribe to new events being added to event store
  useEffect(() => {
    if (!isReady) return

    const timeline = eventStore.timeline({ kinds: VIDEO_KINDS })
    let lastCount = indexedEventIds.size

    const sub = timeline.subscribe({
      next: batch => {
        if (batch && batch.length > 0) {
          const newEvents = batch.filter(e => !indexedEventIds.has(e.id))
          if (newEvents.length > 0) {
            indexVideoEvents(newEvents)
            if (indexedEventIds.size > lastCount) {
              lastCount = indexedEventIds.size
              setTagCount(tagCounts.size)
            }
          }
        }
      },
    })

    return () => sub.unsubscribe()
  }, [eventStore, isReady])

  const searchTagsCallback = useCallback(
    (query: string, limit?: number) => searchTags(query, limit),
    []
  )

  const getAllTagsCallback = useCallback(() => getAllTags(), [])

  return {
    searchTags: searchTagsCallback,
    getAllTags: getAllTagsCallback,
    isReady,
    tagCount,
  }
}

import { SimplePool, Filter } from 'nostr-tools'
import { VideoEvent, processEvents } from '../utils/video-event'
import { getKindsForType, type VideoType } from '../lib/video-types'
import type { ReportedPubkeys } from '@/hooks'
import { presetRelays } from '@/constants/relays'

type VideoCache = VideoEvent

let videos: VideoCache[] = []
const pool = new SimplePool()
const BATCH_SIZE = 50
let isLoading = false
let hasMoreVideos = true
let selectedVideoType: VideoType = 'all'
let followedAuthorsPubkeys: string[] = []
let likedVideoEventIds: string[] = []
let blockedPubkeys: ReportedPubkeys = {}

// Track last timestamp per relay
const relayTimestamps = new Map<string, number>()

// Relay URLs - can be configured via message
let relayUrls = presetRelays.map(r => r.url)

async function loadVideoBatch(): Promise<boolean> {
  try {
    // Query each relay separately to handle pagination per relay
    const results = await Promise.all(
      relayUrls.map(async relayUrl => {
        const lastTimestamp = relayTimestamps.get(relayUrl)
        const filter: Filter = {
          kinds: getKindsForType(selectedVideoType),
          limit: BATCH_SIZE,
          ...(lastTimestamp ? { until: lastTimestamp } : {}),
          ...(followedAuthorsPubkeys.length > 0 ? { authors: followedAuthorsPubkeys } : {}),
          ...(likedVideoEventIds.length > 0 ? { ids: likedVideoEventIds } : {}),
        }

        try {
          const events = await pool.querySync([relayUrl], filter, {
            maxWait: 500,
          })

          if (events.length > 0) {
            // Update last timestamp for this relay
            const minTimestamp = Math.min(...events.map(e => e.created_at))
            relayTimestamps.set(relayUrl, minTimestamp)
          }

          return events
        } catch (err) {
          console.error('Error fetching from ' + relayUrl, err)
        }
        return []
      })
    )

    // Flatten and deduplicate events from all relays
    const allEvents = results.flat()
    const uniqueEvents = Array.from(new Map(allEvents.map(event => [event.id, event])).values())

    if (uniqueEvents.length === 0) {
      hasMoreVideos = false
      return false
    }

    // Process and add new videos
    const newVideos = processEvents(uniqueEvents, relayUrls, blockedPubkeys)

    // Filter out duplicates based on id
    const existingIds = new Set(videos.map(v => v.id))
    const uniqueNewVideos = newVideos.filter(v => !existingIds.has(v.id))

    videos = [...videos, ...uniqueNewVideos].sort((a, b) => b.created_at - a.created_at)

    // Update all tags
    const allTags = new Set<string>()
    videos.forEach(video => {
      video.tags.forEach(tag => allTags.add(tag))
    })

    // Check if any relay still has more events
    const hasMore = Boolean(
      relayUrls.some(relayUrl => {
        const lastTimestamp = relayTimestamps.get(relayUrl)
        return lastTimestamp !== undefined && typeof lastTimestamp === 'number'
      })
    )

    // Notify about progress
    self.postMessage({
      type: 'LOAD_PROGRESS',
      count: videos.length,
      hasMore,
      tags: Array.from(allTags),
    })

    return hasMore
  } catch (error) {
    console.error('Error loading videos:', error)
    return false
  }
}

async function startLoading() {
  if (isLoading) return

  isLoading = true
  relayTimestamps.clear()

  await loadVideoBatch()

  isLoading = false
  self.postMessage({ type: 'LOAD_COMPLETE', count: videos.length })
}

let query: string
let tags: string[] = []

const updateQuery = () => {
  let results: VideoCache[]

  results = query ? videos.filter(video => video.searchText.includes(query)) : videos

  results = tags.length
    ? results.filter(video => tags.some(tag => video.tags.includes(tag)))
    : results

  self.postMessage({
    type: 'SEARCH_RESULTS',
    results: results,
  })
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data

  let allTags: Set<string>

  switch (type) {
    case 'INIT':
      if (data.relayUrls) {
        relayUrls = data.relayUrls
      }
      console.log('startLoading')

      await startLoading()
      updateQuery()
      break

    case 'LOAD_MORE':
      console.log('Loading more videos', isLoading, hasMoreVideos)

      if (!isLoading && hasMoreVideos) {
        await loadVideoBatch()
        updateQuery()
      }
      break

    case 'SEARCH':
      query = data.toLowerCase()
      updateQuery()
      break

    case 'FILTER_TAGS':
      tags = data as string[]
      updateQuery()
      break

    case 'GET_ALL_TAGS':
      allTags = new Set<string>()
      videos.forEach(video => {
        video.tags.forEach(tag => allTags.add(tag))
      })
      self.postMessage({
        type: 'ALL_TAGS',
        tags: Array.from(allTags),
      })
      break

    case 'CLEAR_CACHE':
      videos = []
      relayTimestamps.clear()
      hasMoreVideos = true
      await startLoading()
      break

    case 'SET_VIDEO_TYPE':
      selectedVideoType = data || 'videos'
      videos = []
      relayTimestamps.clear()
      hasMoreVideos = true
      break

    case 'SET_BLOCKED_PUBKEYS':
      blockedPubkeys = data || {}
      break

    case 'SET_FOLLOWED_PUBKEYS':
      followedAuthorsPubkeys = data ? data : []
      videos = []
      relayTimestamps.clear()
      hasMoreVideos = true
      break

    case 'SET_LIKED_VIDEO_IDS':
      likedVideoEventIds = data || []
      videos = []
      relayTimestamps.clear()
      hasMoreVideos = true
      break
  }
}

self.postMessage({ type: 'WORKER_READY' })

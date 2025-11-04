import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { Link } from 'react-router-dom'
import { processEvent, VideoEvent } from '@/utils/video-event'
import { getKindsForType, VideoType } from '@/lib/video-types'
import { formatDistance } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { useReportedPubkeys, useProfile, useAppContext, useReadRelays } from '@/hooks'
import { PlayProgressBar } from './PlayProgressBar'
import React, { useEffect, useMemo, useState } from 'react'
import { imageProxyVideoPreview, imageProxyVideoThumbnail } from '@/lib/utils'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const VideoSuggestionItem = React.memo(function VideoSuggestionItem({
  video,
  thumbResizeServerUrl,
}: {
  video: VideoEvent
  thumbResizeServerUrl?: string
}) {
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.name || video.pubkey.slice(0, 8)
  const [thumbnailError, setThumbnailError] = useState(false)

  const thumbnailUrl = useMemo(() => {
    // If thumbnail failed and we have video URLs, try generating thumbnail from video
    if (thumbnailError && video.urls && video.urls.length > 0) {
      return imageProxyVideoThumbnail(video.urls[0], thumbResizeServerUrl)
    }
    // Otherwise use the original image thumbnail
    return imageProxyVideoPreview(video.images[0], thumbResizeServerUrl)
  }, [thumbnailError, video.images, video.urls, thumbResizeServerUrl])

  const handleThumbnailError = () => {
    console.warn('Thumbnail failed to load:', video.images[0])
    if (!thumbnailError) {
      setThumbnailError(true)
    }
  }

  return (
    <Link to={`/video/${video.link}`}>
      <div className="flex mb-3 hover:bg-accent rounded-lg transition-colors border-none ">
        <div className="relative w-40 h-24 flex-shrink-0">
          <img
            src={thumbnailUrl}
            loading="lazy"
            alt={video.title}
            className="w-full h-full object-cover rounded-md"
            onError={handleThumbnailError}
          />
          <PlayProgressBar videoId={video.id} duration={video.duration} />
          {video.duration > 0 && (
            <div className="absolute bottom-1 right-1 bg-black/80 text-white px-1 rounded text-xs">
              {formatDuration(video.duration)}
            </div>
          )}
        </div>
        <div className="p-1 pl-3">
          <div className="font-medium line-clamp-2 text-sm">{video.title}</div>
          <div className="text-xs text-muted-foreground mt-1">{name}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatDistance(new Date(video.created_at * 1000), new Date(), {
              addSuffix: true,
            })}
          </div>
        </div>
      </div>
    </Link>
  )
})

function VideoSuggestionItemSkeleton() {
  return (
    <div className="flex mb-4">
      <div className="relative w-40 h-24 flex-shrink-0">
        <Skeleton className="w-full h-full rounded-md" />
      </div>
      <div className="p-1 pl-3 space-y-2 flex-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

interface VideoSuggestionsProps {
  currentVideoId?: string
  authorPubkey?: string
  currentVideoType?: VideoType
  relays?: string[] // Relays from nevent or other sources
}

export function VideoSuggestions({
  currentVideoId,
  currentVideoType,
  authorPubkey,
  relays,
}: VideoSuggestionsProps) {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const blockedPubkeys = useReportedPubkeys()
  const readRelays = useReadRelays()

  // Combine provided relays with config relays (prioritize provided relays)
  const relaysToUse = useMemo(() => {
    const configRelays = config.relays.map(r => r.url)
    const combined = relays ? [...relays, ...configRelays] : configRelays
    // Remove duplicates
    const deduplicated = [...new Set(combined)]
    if (import.meta.env.DEV) console.log('[VideoSuggestions] Relays to use:', deduplicated)
    return deduplicated
  }, [relays, config.relays])

  // Load events from the relays
  useEffect(() => {
    if (relaysToUse.length === 0) {
      if (import.meta.env.DEV) console.log('[VideoSuggestions] No relays available, skipping load')
      return
    }

    if (import.meta.env.DEV) {
      console.log('[VideoSuggestions] Loading suggestions from relays:', relaysToUse)
      console.log('[VideoSuggestions] Author pubkey:', authorPubkey)
      console.log('[VideoSuggestions] Video type:', currentVideoType)
    }

    const filters = [
      {
        kinds: currentVideoType ? getKindsForType(currentVideoType) : getKindsForType('all'),
        limit: 30,
      },
    ]

    // Add author filter if we have an author
    if (authorPubkey) {
      filters.unshift({
        kinds: getKindsForType('all'),
        authors: [authorPubkey],
        limit: 30,
      })
    }

    if (import.meta.env.DEV) console.log('[VideoSuggestions] Filters:', filters)

    const playlistLoader = createTimelineLoader(pool, relaysToUse, filters, {
      eventStore,
      limit: 30,
    })
    const sub = playlistLoader().subscribe({
      next: events => {
        if (import.meta.env.DEV) console.log('[VideoSuggestions] Loaded events:', events.length)
      },
      error: err => {
        console.error('[VideoSuggestions] Error loading events:', err)
      },
    })
    return () => sub.unsubscribe()
  }, [authorPubkey, currentVideoType, relaysToUse, pool, eventStore])

  // Use EventStore timeline for author-specific suggestions
  const authorSuggestionsObservable = eventStore.timeline([
    {
      kinds: getKindsForType('all'),
      authors: authorPubkey ? [authorPubkey] : [],
      limit: 30,
    },
  ])

  const authorSuggestions = useObservableState(authorSuggestionsObservable, [])
  const authorIsLoading = authorPubkey && authorSuggestions.length === 0

  // Use EventStore timeline for global suggestions
  const globalSuggestionsObservable = eventStore.timeline([
    {
      kinds: currentVideoType ? getKindsForType(currentVideoType) : getKindsForType('all'),
      limit: 30,
    },
  ])

  const globalSuggestions = useObservableState(globalSuggestionsObservable, [])
  const globalIsLoading = globalSuggestions.length === 0

  const suggestions = useMemo(() => {
    const events = [...authorSuggestions, ...globalSuggestions]

    // Process and filter unique videos, excluding the current video
    const processedVideos: VideoEvent[] = []
    const seenIds = new Set<string>()

    for (const event of events) {
      if (blockedPubkeys && blockedPubkeys[event.pubkey]) continue
      const processed = processEvent(event, readRelays, config.blossomServers)
      if (processed && processed.id !== currentVideoId && !seenIds.has(processed.id)) {
        processedVideos.push(processed)
        seenIds.add(processed.id)
      }
    }

    return processedVideos.slice(0, 30) // Return up to 30 unique suggestions
  }, [
    authorSuggestions,
    globalSuggestions,
    blockedPubkeys,
    currentVideoId,
    readRelays,
    config.blossomServers,
  ])

  return (
    /* <ScrollArea className="h-[calc(100vh-4rem)]"> */
    <div className="sm:grid grid-cols-2 gap-4 lg:block">
      {authorIsLoading || globalIsLoading
        ? Array.from({ length: 10 }).map((_, i) => <VideoSuggestionItemSkeleton key={i} />)
        : suggestions.map(video => (
            <VideoSuggestionItem
              key={video.id}
              video={video}
              thumbResizeServerUrl={config.thumbResizeServerUrl}
            />
          ))}
    </div>
  )
}

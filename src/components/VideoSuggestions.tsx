import { useEventStore, use$ } from 'applesauce-react/hooks'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { processEvent, type VideoEvent, getPublishDate } from '@/utils/video-event'
import { getKindsForType, type VideoType } from '@/lib/video-types'
import { formatDistance } from 'date-fns/formatDistance'
import { Skeleton } from '@/components/ui/skeleton'
import { useReportedPubkeys, useProfile, useAppContext, useReadRelays } from '@/hooks'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { PlayProgressBar } from './PlayProgressBar'
import React, { useEffect, useMemo, useState } from 'react'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
import { filterVideoSuggestions } from '@/lib/filter-video-suggestions'
import { imageProxyVideoPreview, imageProxyVideoThumbnail, combineRelays } from '@/lib/utils'
import { type TimelessFilter } from 'applesauce-loaders'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { logSubscriptionCreated, logSubscriptionClosed } from '@/lib/relay-debug'
import { UserAvatar } from '@/components/UserAvatar'
import { getDateLocale } from '@/lib/date-locale'

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
  const { i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.name || video.pubkey.slice(0, 8)
  const authorPicture = metadata?.picture
  const [thumbnailError, setThumbnailError] = useState(false)
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false)

  const thumbnailUrl = useMemo(() => {
    // If thumbnail failed and we have video URLs, try generating thumbnail from video
    if (thumbnailError && video.urls && video.urls.length > 0) {
      return imageProxyVideoThumbnail(video.urls[0], thumbResizeServerUrl)
    }
    // Otherwise use the original image thumbnail
    return imageProxyVideoPreview(video.images[0], thumbResizeServerUrl)
  }, [thumbnailError, video.images, video.urls, thumbResizeServerUrl])

  // Generate blurhash placeholder for LQIP (Low Quality Image Placeholder)
  const blurhashPlaceholder = useMemo(() => {
    const blurhash = video.thumbnailVariants?.[0]?.blurhash
    return blurHashToDataURL(blurhash)
  }, [video.thumbnailVariants])

  const handleThumbnailError = () => {
    console.warn('Thumbnail failed to load:', video.images[0])
    if (!thumbnailError) {
      setThumbnailError(true)
      setThumbnailLoaded(false)
    }
  }

  const handleThumbnailLoad = () => {
    setThumbnailLoaded(true)
  }

  // Link to shorts page for short videos, video page for regular videos
  const linkTo = video.type === 'shorts' ? `/short/${video.link}` : `/video/${video.link}`

  return (
    <Link to={linkTo} className="group">
      <div className="relative flex p-2 rounded-lg border-none overflow-hidden transition-all duration-300 hover:bg-accent group-hover:shadow-sm group-hover:scale-[1.02]">
        <div className="relative w-40 h-24 shrink-0">
          {/* Placeholder shown while thumbnail loads - blurhash or skeleton */}
          {!thumbnailLoaded &&
            (blurhashPlaceholder ? (
              <img
                src={blurhashPlaceholder}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover rounded-md absolute"
              />
            ) : (
              <Skeleton className="w-full h-full rounded-md absolute" />
            ))}
          <img
            src={thumbnailUrl}
            loading="lazy"
            alt={video.title}
            className="w-full h-full object-cover rounded-md"
            onError={handleThumbnailError}
            onLoad={handleThumbnailLoad}
          />
          <PlayProgressBar videoId={video.id} duration={video.duration} />
          {video.duration > 0 && (
            <div className="absolute bottom-1 right-1 bg-black/80 text-white px-1 rounded text-xs">
              {formatDuration(video.duration)}
            </div>
          )}
        </div>
        <div className="relative pl-3">
          <div className="font-medium line-clamp-2 text-sm">{video.title}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <UserAvatar
              picture={authorPicture}
              pubkey={video.pubkey}
              name={name}
              className="h-4 w-4"
            />
            <div className="text-xs text-muted-foreground">{name}</div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatDistance(new Date(getPublishDate(video) * 1000), new Date(), {
              addSuffix: true,
              locale: dateLocale,
            })}
          </div>
        </div>
      </div>
    </Link>
  )
})

function VideoSuggestionItemSkeleton() {
  return (
    <div className="flex p-2">
      <div className="relative w-40 h-24 shrink-0">
        <Skeleton className="w-full h-full rounded-md" />
      </div>
      <div className="pl-3 space-y-2 flex-1">
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
  cinemaMode?: boolean
}

export const VideoSuggestions = React.memo(function VideoSuggestions({
  currentVideoId,
  currentVideoType,
  authorPubkey,
  relays,
  cinemaMode,
}: VideoSuggestionsProps) {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()
  const readRelays = useReadRelays()

  // Combine provided relays with config relays (prioritize provided relays)
  // Use combineRelays to normalize URLs and remove duplicates (e.g., 'nos.lol' vs 'nos.lol/')
  const relaysToUse = useMemo(() => {
    const configRelays = config.relays.map(r => r.url)
    const combined = relays ? combineRelays([relays, configRelays]) : configRelays
    if (import.meta.env.DEV) console.log('[VideoSuggestions] Relays to use:', combined)
    return combined
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

    const filters: TimelessFilter[] = [
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

    const subId = logSubscriptionCreated('VideoSuggestions', relaysToUse, filters)

    const playlistLoader = createTimelineLoader(pool, relaysToUse, filters, {
      eventStore,
      limit: 30,
    })
    const sub = playlistLoader().subscribe({
      next: () => {
        // Event loaded successfully
      },
      error: err => {
        console.error('[VideoSuggestions] Error loading events:', err)
      },
      complete: () => {
        logSubscriptionClosed(subId)
      },
    })
    return () => {
      sub.unsubscribe()
      logSubscriptionClosed(subId)
    }
  }, [authorPubkey, currentVideoType, relaysToUse, pool, eventStore])

  // Use EventStore timeline for author-specific suggestions
  const authorSuggestions =
    use$(
      () =>
        eventStore.timeline([
          {
            kinds: getKindsForType('all'),
            authors: authorPubkey ? [authorPubkey] : [],
            limit: 30,
          },
        ]),
      [eventStore, authorPubkey]
    ) ?? []
  const authorIsLoading = authorPubkey && authorSuggestions.length === 0

  // Use EventStore timeline for global suggestions
  const globalSuggestions =
    use$(
      () =>
        eventStore.timeline([
          {
            kinds: currentVideoType ? getKindsForType(currentVideoType) : getKindsForType('all'),
            limit: 30,
          },
        ]),
      [eventStore, currentVideoType]
    ) ?? []
  const globalIsLoading = globalSuggestions.length === 0

  const suggestions = useMemo(() => {
    const events = [...authorSuggestions, ...globalSuggestions]

    // Process events into VideoEvent objects
    const processedVideos: VideoEvent[] = []
    for (const event of events) {
      const processed = processEvent(
        event,
        readRelays,
        config.blossomServers,
        presetContent.nsfwPubkeys
      )
      if (processed) {
        processedVideos.push(processed)
      }
    }

    // Filter videos using the shared filter function
    const filtered = filterVideoSuggestions(processedVideos, {
      currentVideoId,
      blockedPubkeys,
    })

    // Sort by publish date descending (newest first), fallback to created_at
    filtered.sort((a, b) => getPublishDate(b) - getPublishDate(a))

    return filtered.slice(0, 30) // Return up to 30 unique suggestions
  }, [
    authorSuggestions,
    globalSuggestions,
    blockedPubkeys,
    currentVideoId,
    readRelays,
    config.blossomServers,
    presetContent.nsfwPubkeys,
  ])

  return (
    /* <ScrollArea className="h-[calc(100vh-4rem)]"> */
    <div className={`sm:grid grid-cols-2 ${cinemaMode ? '' : 'lg:block'}`}>
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
})

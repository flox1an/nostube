import { useEventStore, use$ } from 'applesauce-react/hooks'
import { DesktopVideoLink } from '@/desktop/DesktopVideoLink'
import { useDesktopWindowCoordinator } from '@/desktop/useDesktopWindowCoordinator'
import { useTranslation } from 'react-i18next'
import {
  processEvent,
  type VideoEvent,
  getPublishDate,
  isAudioVideo,
  isYouTubeVideo,
} from '@/utils/video-event'
import { buildDesktopPlayerUrl, buildVideoPath } from '@/utils/video-utils'
import { getKindsForType, type VideoType } from '@/lib/video-types'
import { formatDistance } from 'date-fns/formatDistance'
import { Skeleton } from '@/components/ui/skeleton'
import { useReportedPubkeys, useProfile, useAppContext, useReadRelays } from '@/hooks'
import { useImageCascade } from '@/hooks/useImageCascade'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { PlayProgressBar } from './PlayProgressBar'
import React, { useEffect, useMemo, useState } from 'react'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
import { filterVideoSuggestions } from '@/lib/filter-video-suggestions'
import { useTrustScores, useGlobalScores } from '@/hooks/useTrustScore'
import { useFollowSet } from '@/hooks/useFollowSet'
import { passesTrustFilter } from '@/hooks/useTrustFilter'
import { combineRelays } from '@/lib/utils'
import audioFallback from '@/assets/audio-fallback.webp'
import { type TimelessFilter } from 'applesauce-loaders'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { logSubscriptionCreated, logSubscriptionClosed } from '@/lib/relay-debug'
import { UserAvatar } from '@/components/UserAvatar'
import { getDateLocale } from '@/lib/date-locale'
import { useSearchRecommendations } from '@/hooks/useSearchRecommendations'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { isNSFWAuthor } from '@/lib/nsfw-authors'
import type { RecommendationVideo } from '@/types/recommendation'

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
}: {
  video: VideoEvent
}) {
  const { i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.name || video.pubkey.slice(0, 8)
  const authorPicture = metadata?.picture
  const isAudio = video.mediaType === 'audio'
  const desktopWindowCoordinator = useDesktopWindowCoordinator()

  const cascade = useImageCascade({
    src: video.images?.[0],
    videoUrl: video.urls?.[0],
    variant: 'preview',
    authorPubkey: video.pubkey,
  })

  // Audio fallback fills in when the cascade has no candidate left and we're playing audio.
  const displaySrc = cascade.src ?? (isAudio ? audioFallback : null)
  const usingFallback = !cascade.src && displaySrc !== null
  const [fallbackLoaded, setFallbackLoaded] = useState(false)
  // The previously decoded candidate stays painted while the next one loads, so a slow or
  // rate-limited cascade step never regresses a visible thumbnail to a skeleton.
  const thumbnailLoaded = usingFallback ? fallbackLoaded : cascade.loaded
  const heldThumbnail = usingFallback ? null : cascade.loadedSrc

  const blurhashPlaceholder = useMemo(() => {
    const blurhash = video.thumbnailVariants?.[0]?.blurhash
    return blurHashToDataURL(blurhash)
  }, [video.thumbnailVariants])

  const handleThumbnailLoad = () => {
    if (usingFallback) setFallbackLoaded(true)
    else cascade.onLoad()
  }

  // Link to shorts page for short videos, video page for regular videos
  const linkTo = buildVideoPath(video.link, video.type === 'shorts' ? 'shorts' : 'video')
  const desktopPlayerRoute = video.type === 'shorts' ? undefined : buildDesktopPlayerUrl(video.link)

  return (
    <DesktopVideoLink
      to={linkTo}
      className="group"
      desktopCoordinator={desktopWindowCoordinator}
      desktopRoute={desktopPlayerRoute}
    >
      <div className="relative flex p-2 rounded-lg border-none overflow-hidden transition-all duration-300 hover:bg-accent group-hover:shadow-sm group-hover:scale-[1.02]">
        <div className="relative w-40 h-24 2xl:w-64 2xl:h-38 shrink-0">
          {/* Placeholder while loading: last loaded image, blurhash, skeleton */}
          {!thumbnailLoaded &&
            (heldThumbnail ? (
              <img
                src={heldThumbnail}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover rounded-md absolute"
              />
            ) : blurhashPlaceholder ? (
              <img
                src={blurhashPlaceholder}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover rounded-md absolute"
              />
            ) : (
              <Skeleton className="w-full h-full rounded-md absolute" />
            ))}
          {displaySrc && (
            <img
              src={displaySrc}
              loading="lazy"
              alt={video.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-md"
              onError={cascade.onError}
              onLoad={handleThumbnailLoad}
            />
          )}
          <PlayProgressBar videoId={video.id} duration={video.duration} />
          {video.duration > 0 && (
            <div className="absolute bottom-1 right-1 bg-black/50 text-white px-1 rounded text-xs">
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
    </DesktopVideoLink>
  )
})

const RecommendationVideoSuggestionItem = React.memo(function RecommendationVideoSuggestionItem({
  video,
}: {
  video: RecommendationVideo
}) {
  const { i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.name || video.pubkey.slice(0, 8)
  const authorPicture = metadata?.picture
  const primaryImage = video.thumbnailVariants?.[0]?.url ?? video.images?.[0]
  const videoUrl = video.urls?.[0]
  const isAudio = video.mediaType === 'audio'
  const desktopWindowCoordinator = useDesktopWindowCoordinator()

  const cascade = useImageCascade({
    src: primaryImage,
    videoUrl,
    variant: 'preview',
    authorPubkey: video.pubkey,
  })

  const displaySrc = cascade.src ?? (isAudio ? audioFallback : null)
  const usingFallback = !cascade.src && displaySrc !== null
  const [fallbackLoaded, setFallbackLoaded] = useState(false)
  const thumbnailLoaded = usingFallback ? fallbackLoaded : cascade.loaded
  const heldThumbnail = usingFallback ? null : cascade.loadedSrc

  const blurhashPlaceholder = useMemo(() => {
    const blurhash = video.thumbnailVariants?.[0]?.blurhash
    return blurHashToDataURL(blurhash)
  }, [video.thumbnailVariants])

  const handleThumbnailLoad = () => {
    if (usingFallback) setFallbackLoaded(true)
    else cascade.onLoad()
  }

  const publishDate = video.published_at ?? video.created_at
  const linkTo = buildVideoPath(video.link, video.type === 'shorts' ? 'shorts' : 'video')
  const desktopPlayerRoute = video.type === 'shorts' ? undefined : buildDesktopPlayerUrl(video.link)

  return (
    <DesktopVideoLink
      to={linkTo}
      className="group"
      desktopCoordinator={desktopWindowCoordinator}
      desktopRoute={desktopPlayerRoute}
    >
      <div className="relative flex p-2 rounded-lg border-none overflow-hidden transition-all duration-300 hover:bg-accent group-hover:shadow-sm group-hover:scale-[1.02]">
        <div className="relative w-40 h-24 2xl:w-56 2xl:h-[7.875rem] shrink-0">
          {!thumbnailLoaded &&
            (heldThumbnail ? (
              <img
                src={heldThumbnail}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover rounded-md absolute"
              />
            ) : blurhashPlaceholder ? (
              <img
                src={blurhashPlaceholder}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover rounded-md absolute"
              />
            ) : (
              <Skeleton className="w-full h-full rounded-md absolute" />
            ))}
          {displaySrc && (
            <img
              src={displaySrc}
              loading="lazy"
              alt={video.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-md"
              onError={cascade.onError}
              onLoad={handleThumbnailLoad}
            />
          )}
          <PlayProgressBar videoId={video.id} duration={video.duration} />
          {video.duration > 0 && (
            <div className="absolute bottom-1 right-1 bg-black/50 text-white px-1 rounded text-xs">
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
            {formatDistance(new Date(publishDate * 1000), new Date(), {
              addSuffix: true,
              locale: dateLocale,
            })}
          </div>
        </div>
      </div>
    </DesktopVideoLink>
  )
})

function VideoSuggestionItemSkeleton() {
  return (
    <div className="flex p-2">
      <div className="relative w-40 h-24 2xl:w-56 2xl:h-[7.875rem] shrink-0">
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
  videoRef?: string // nevent or naddr for the search service recommendations
}

export const VideoSuggestions = React.memo(function VideoSuggestions({
  currentVideoId,
  currentVideoType,
  authorPubkey,
  relays,
  cinemaMode,
  videoRef,
}: VideoSuggestionsProps) {
  const { t } = useTranslation()
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const { user } = useCurrentUser()
  const { presetContent } = useSelectedPreset()
  const blockedPubkeys = useReportedPubkeys()
  const readRelays = useReadRelays()
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // Search service recommendations (primary source)
  const excludeContentWarnings = config.nsfwFilter === 'hide'
  const {
    videos: serviceVideos,
    isLoading: isLoadingService,
    presetUnavailable: servicePresetUnavailable,
  } = useSearchRecommendations({
    videoRef,
    userPubkey: user?.pubkey,
    excludeContentWarnings,
    limit: 30,
  })

  const filteredServiceVideos = useMemo(() => {
    if (!serviceVideos) return null
    if (config.nsfwFilter === 'hide') {
      return serviceVideos.filter(v => !isNSFWAuthor(v.pubkey, presetContent.nsfwPubkeys))
    }
    // In warning/show modes, preserve server contentWarning annotations
    return serviceVideos
  }, [serviceVideos, presetContent.nsfwPubkeys, config.nsfwFilter])

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
      setIsLoadingSuggestions(false)
      return
    }

    setIsLoadingSuggestions(true)

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
        setIsLoadingSuggestions(false)
      },
      complete: () => {
        setIsLoadingSuggestions(false)
        logSubscriptionClosed(subId)
      },
    })
    return () => {
      sub.unsubscribe()
      logSubscriptionClosed(subId)
    }
  }, [authorPubkey, currentVideoType, relaysToUse, pool, eventStore])

  // Use EventStore timeline for author-specific suggestions
  const rawAuthorSuggestions = use$(
    () =>
      eventStore.timeline([
        {
          kinds: getKindsForType('all'),
          authors: authorPubkey ? [authorPubkey] : [],
          limit: 30,
        },
      ]),
    [eventStore, authorPubkey]
  )
  const authorSuggestions = useMemo(() => rawAuthorSuggestions ?? [], [rawAuthorSuggestions])

  // Use EventStore timeline for global suggestions
  const rawGlobalSuggestions = use$(
    () =>
      eventStore.timeline([
        {
          kinds: currentVideoType ? getKindsForType(currentVideoType) : getKindsForType('all'),
          limit: 30,
        },
      ]),
    [eventStore, currentVideoType]
  )
  const globalSuggestions = useMemo(() => rawGlobalSuggestions ?? [], [rawGlobalSuggestions])

  const suggestions = useMemo(() => {
    // Process author videos separately
    const authorVideos: VideoEvent[] = []
    for (const event of authorSuggestions) {
      const processed = processEvent(
        event,
        readRelays,
        config.blossomServers,
        presetContent.nsfwPubkeys
      )
      if (
        processed &&
        ((config.showYouTubeContent ?? true) || !isYouTubeVideo(processed)) &&
        ((config.showAudioContent ?? true) || !isAudioVideo(processed))
      ) {
        authorVideos.push(processed)
      }
    }

    // Process global videos separately
    const globalVideos: VideoEvent[] = []
    for (const event of globalSuggestions) {
      const processed = processEvent(
        event,
        readRelays,
        config.blossomServers,
        presetContent.nsfwPubkeys
      )
      if (
        processed &&
        ((config.showYouTubeContent ?? true) || !isYouTubeVideo(processed)) &&
        ((config.showAudioContent ?? true) || !isAudioVideo(processed))
      ) {
        globalVideos.push(processed)
      }
    }

    // Filter each section separately
    const filteredAuthor = filterVideoSuggestions(authorVideos, {
      currentVideoId,
      blockedPubkeys,
    })
    const filteredGlobal = filterVideoSuggestions(globalVideos, {
      currentVideoId,
      blockedPubkeys,
    })

    // Sort each section by publish date descending (newest first)
    filteredAuthor.sort((a, b) => getPublishDate(b) - getPublishDate(a))
    filteredGlobal.sort((a, b) => getPublishDate(b) - getPublishDate(a))

    // Combine: author videos first, then global (excluding duplicates)
    const seenIds = new Set(filteredAuthor.map(v => v.id))
    const uniqueGlobal = filteredGlobal.filter(v => !seenIds.has(v.id))

    return [...filteredAuthor, ...uniqueGlobal].slice(0, 30)
  }, [
    authorSuggestions,
    globalSuggestions,
    blockedPubkeys,
    currentVideoId,
    readRelays,
    config.blossomServers,
    config.showYouTubeContent,
    config.showAudioContent,
    presetContent.nsfwPubkeys,
  ])

  // Trust score filtering — always on (ephemeral key used when logged out)
  const { followedPubkeys } = useFollowSet()
  const followedSet = useMemo(() => new Set(followedPubkeys), [followedPubkeys])

  const suggestionPubkeys = useMemo(
    () => [...new Set(suggestions.map(v => v.pubkey))],
    [suggestions]
  )

  // Don't request trust scores for relay suggestions when service results are shown —
  // they won't be rendered, so the ContextVM calls would be wasted.
  const trustPubkeys = filteredServiceVideos !== null ? [] : suggestionPubkeys
  const personalScores = useTrustScores(trustPubkeys)
  const globalScores = useGlobalScores(trustPubkeys)

  // Track if scores arrived after initial render (deferred filtering)
  const [scoresReady, setScoresReady] = useState(false)
  const hadScoresOnMount = useMemo(() => {
    if (suggestionPubkeys.length === 0) return true
    // If any score is already available on first check, scores were cached
    return suggestionPubkeys.some(pk => personalScores.get(pk) !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!scoresReady && suggestionPubkeys.some(pk => personalScores.get(pk) !== null)) {
      setScoresReady(true)
    }
  }, [personalScores, suggestionPubkeys, scoresReady])

  // Fade in only when scores arrived after a delay (not cached from the start)
  const shouldFadeIn = !hadScoresOnMount && scoresReady

  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(v =>
      passesTrustFilter({
        authorPubkey: v.pubkey,
        currentUserPubkey: user?.pubkey,
        followedPubkeys: followedSet,
        personalScore: personalScores.get(v.pubkey),
        globalScore: globalScores.get(v.pubkey),
      })
    )
  }, [suggestions, personalScores, globalScores, followedSet, user])

  const showLoadingSkeletons =
    (isLoadingService && filteredServiceVideos === null && !servicePresetUnavailable) ||
    (!filteredServiceVideos && isLoadingSuggestions && suggestions.length === 0)

  // Use service results when available, fall back to relay-based suggestions
  const useServiceResults = filteredServiceVideos !== null

  return (
    /* <ScrollArea className="h-[calc(100vh-4rem)]"> */
    <div
      className={`sm:grid grid-cols-2 ${cinemaMode ? '' : 'lg:block'} ${shouldFadeIn ? 'animate-in fade-in duration-200' : ''}`}
    >
      {showLoadingSkeletons ? (
        Array.from({ length: 10 }).map((_, i) => <VideoSuggestionItemSkeleton key={i} />)
      ) : useServiceResults ? (
        filteredServiceVideos!.length > 0 ? (
          filteredServiceVideos!.map(video => (
            <RecommendationVideoSuggestionItem key={video.id} video={video} />
          ))
        ) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-1">
            {t('video.noSuggestions', 'No suggestions yet.')}
          </div>
        )
      ) : servicePresetUnavailable ? (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-1">
          <p className="font-semibold text-destructive">
            {t('video.presetUnavailable', 'Safety configuration unavailable')}
          </p>
          <p className="mt-1">
            {t('video.presetUnavailableDescription', 'Recommendations may not be fully filtered.')}
          </p>
        </div>
      ) : filteredSuggestions.length > 0 ? (
        filteredSuggestions.map(video => <VideoSuggestionItem key={video.id} video={video} />)
      ) : (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-1">
          {t('video.noSuggestions', 'No suggestions yet.')}
        </div>
      )}
    </div>
  )
})

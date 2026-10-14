import { Link } from 'react-router-dom'
import { formatDistance } from 'date-fns/formatDistance'
import { type VideoEvent, getPublishDate } from '@nostube/core/video-event'
import { buildVideoPath, buildVideoUrlObject } from '@/utils/video-utils'
import { formatDuration } from '@nostube/core/formatDuration'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { cn } from '@/lib/utils'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import React, { useMemo } from 'react'
import { blurHashToDataURL } from '@nostube/core/blurhashDataURL'
import { PlayProgressBar } from './PlayProgressBar'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { useEventStore } from 'applesauce-react/hooks'
import { buildProfileUrl } from '@/lib/nprofile'
import { useAppContext } from '@/hooks'
import { useImageCascade } from '@nostube/widgets/hooks/useImageCascade'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { ImageOff } from 'lucide-react'
import audioFallback from '@nostube/widgets/assets/audio-fallback.webp'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/date-locale'
import { formatDate } from 'date-fns'
import { DesktopVideoLink } from '@/desktop/DesktopVideoLink'
import { useDesktopWindowCoordinator } from '@/desktop/useDesktopWindowCoordinator'
import { UserActionsMenu } from '@/components/UserActionsMenu'

interface VideoCardProps {
  video: VideoEvent
  hideAuthor?: boolean
  format: 'vertical' | 'horizontal' | 'square'
  playlistParam?: string
  allVideos?: VideoEvent[] // Full list of videos for shorts navigation
  videoIndex?: number // Index of this video in the allVideos array
  /**
   * Card sits in a grid: below `sm` it renders edge-to-edge with square corners
   * (horizontal: full width, vertical: grid gap only, title/creator as overlay). Rounded from `sm` up.
   */
  fullBleed?: boolean
  /**
   * Above-the-fold card: fetch the thumbnail eagerly at high priority.
   * Lazy images are only dispatched after layout, so on a busy main thread
   * the first visible row would otherwise wait for the render storm to end.
   */
  priority?: boolean
}

export const VideoCard = React.memo(function VideoCard({
  video,
  hideAuthor,
  format = 'square',
  playlistParam,
  allVideos,
  videoIndex,
  fullBleed = false,
  priority = false,
}: VideoCardProps) {
  const { t, i18n } = useTranslation()
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.display_name || metadata?.name || video?.pubkey.slice(0, 8)
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { setVideos } = useShortsFeedStore()
  const desktopWindowCoordinator = useDesktopWindowCoordinator()

  // Map i18n language codes to date-fns locales
  const dateLocale = getDateLocale(i18n.language)

  // Get the event from the store to access seenRelays
  const event = useMemo(() => eventStore.getEvent(video.id), [eventStore, video.id])
  const authorProfileUrl = useMemo(
    () => buildProfileUrl(video.pubkey, event),
    [video.pubkey, event]
  )

  // Determine if we should show NSFW warning based on filter setting (default to 'hide' if not set)
  const nsfwFilter = config.nsfwFilter ?? 'hide'
  const showNsfwWarning = video.contentWarning && nsfwFilter === 'warning'

  // Full-bleed shorts tiles show title/creator on the thumbnail below `sm`.
  const overlayMeta = fullBleed && format === 'vertical'

  const aspectRatio =
    format == 'vertical' ? 'aspect-[2/3]' : format == 'square' ? 'aspect-[1/1]' : 'aspect-video'

  const cascade = useImageCascade({
    src: video.images?.[0],
    videoUrl: video.urls?.[0],
    variant: 'preview',
    authorPubkey: video.pubkey,
    // Off-screen cards are lazy: their <img> has not started fetching, so racing the raw URL
    // would force-load both candidates for every card in the grid at once.
    race: priority,
  })

  // While the cascade advances to a new candidate (proxy → raw → video-frame) the previously
  // decoded image stays painted underneath, so a slow or rate-limited follow-up request never
  // regresses a visible thumbnail back to a skeleton.
  const thumbnailLoaded = cascade.loaded
  const heldThumbnail = cascade.loadedSrc

  // Generate blurhash placeholder for LQIP (Low Quality Image Placeholder)
  const blurhashPlaceholder = useMemo(() => {
    const blurhash = video.thumbnailVariants?.[0]?.blurhash
    return blurHashToDataURL(blurhash)
  }, [video.thumbnailVariants])

  // Determine video type for URL building
  const videoType = video.type === 'shorts' ? 'shorts' : 'video'

  // Build URL with optional playlist or shorts navigation params
  const to = useMemo(() => {
    if (playlistParam && videoType === 'video') {
      return buildVideoUrlObject(video.link, 'video', { playlist: playlistParam })
    }

    if (video.type === 'shorts' && allVideos && videoIndex !== undefined) {
      // Pass author pubkey and video event ID (scalable approach)
      return {
        pathname: buildVideoPath(video.link, 'shorts'),
        search: `?author=${video.pubkey}&video=${video.id}`,
      }
    }

    return buildVideoPath(video.link, videoType)
  }, [
    playlistParam,
    videoType,
    video.link,
    video.type,
    video.pubkey,
    video.id,
    allVideos,
    videoIndex,
  ])

  const desktopPlayerRoute =
    videoType === 'video'
      ? `/desktop/player/${video.link}${playlistParam ? `?playlist=${encodeURIComponent(playlistParam)}` : ''}`
      : undefined

  const handleThumbnailLoad = cascade.onLoad

  // Handle shorts click - populate store with video list
  const handleShortsClick = () => {
    if (video.type === 'shorts' && allVideos && videoIndex !== undefined) {
      // Populate the store with the shorts list and starting index
      setVideos(allVideos, videoIndex)
    }
  }

  return (
    <div
      className={cn(
        'group rounded-xl px-1 pb-6 motion-safe:transition-colors motion-safe:duration-150 hover:bg-accent/55 motion-reduce:transition-none sm:px-2',
        fullBleed && 'rounded-none sm:rounded-xl',
        fullBleed && format !== 'vertical' && 'px-0 sm:px-2',
        overlayMeta && 'p-0 sm:pb-6'
      )}
      style={{ contain: 'layout style paint' }}
    >
      <div>
        <DesktopVideoLink
          to={to}
          onClick={handleShortsClick}
          desktopCoordinator={desktopWindowCoordinator}
          desktopRoute={desktopPlayerRoute}
          className={cn(
            'block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            fullBleed && 'rounded-none sm:rounded-xl'
          )}
        >
          {/* Container with fixed aspect ratio ensures consistent size regardless of thumbnail state */}
          <div
            className={cn(
              'w-full overflow-hidden relative bg-muted rounded-xl ring-1 ring-inset ring-black/10 shadow-sm dark:ring-white/10',
              fullBleed && 'rounded-none ring-0 shadow-none sm:rounded-xl sm:ring-1 sm:shadow-sm',
              aspectRatio
            )}
          >
            {/* Show error state if both thumbnail and fallback failed */}
            {cascade.exhausted ? (
              video.mediaType === 'audio' ? (
                <img
                  src={audioFallback}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-muted flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageOff className="h-12 w-12" />
                    <span className="text-sm">{t('video.thumbnailUnavailable')}</span>
                  </div>
                </div>
              )
            ) : (
              <>
                {/* Placeholder while the current candidate loads: last loaded image, blurhash, skeleton */}
                {!thumbnailLoaded &&
                  (heldThumbnail ? (
                    <img
                      src={heldThumbnail}
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        showNsfwWarning ? 'blur-lg' : '',
                        'absolute inset-0 w-full h-full object-cover'
                      )}
                    />
                  ) : blurhashPlaceholder ? (
                    <img
                      src={blurhashPlaceholder}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
                  ))}
                <img
                  src={cascade.src ?? ''}
                  loading={priority ? 'eager' : 'lazy'}
                  fetchPriority={priority ? 'high' : 'auto'}
                  decoding="async"
                  alt={video.title}
                  referrerPolicy="no-referrer"
                  className={cn(
                    showNsfwWarning ? 'blur-lg' : '',
                    'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                    !thumbnailLoaded && 'opacity-0'
                  )}
                  onError={cascade.onError}
                  onLoad={handleThumbnailLoad}
                />
              </>
            )}
            {showNsfwWarning && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-2xl font-bold text-white drop-shadow-lg">Content warning</div>
                <div className="text-base font-semibold text-white drop-shadow-lg mt-4">
                  {video.contentWarning}
                </div>
              </div>
            )}
            {overlayMeta && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/35 to-transparent px-2 pt-10 pb-2 text-white sm:hidden">
                <p className="line-clamp-2 break-words text-[13px] font-semibold leading-4 drop-shadow">
                  {video.title}
                </p>
                {!hideAuthor && <p className="mt-0.5 truncate text-xs text-white/80">{name}</p>}
              </div>
            )}
            {/* Progress bar at bottom of thumbnail */}
            <PlayProgressBar videoId={video.id} duration={video.duration} />
            {video.duration > 0 && (
              <div
                className={cn(
                  'absolute bottom-2 right-2 bg-black/50 text-white px-1 rounded text-sm',
                  overlayMeta && 'max-sm:top-2 max-sm:bottom-auto'
                )}
              >
                {formatDuration(video.duration)}
              </div>
            )}
          </div>
        </DesktopVideoLink>
        <div
          className={cn(
            'pt-3 px-1',
            fullBleed && (format === 'vertical' ? 'hidden sm:block' : 'px-4 sm:px-1')
          )}
        >
          <div className="flex gap-3">
            {!hideAuthor && format !== 'vertical' && (
              <Link
                to={authorProfileUrl}
                className="relative shrink-0 after:absolute after:-inset-0.5"
              >
                <UserAvatar
                  picture={metadata?.picture}
                  pubkey={video.pubkey}
                  name={name}
                  className="h-10 w-10"
                />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <DesktopVideoLink
                to={to}
                onClick={handleShortsClick}
                desktopCoordinator={desktopWindowCoordinator}
                desktopRoute={desktopPlayerRoute}
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <h3 className="line-clamp-2 break-words text-[15px] font-semibold leading-5 tracking-[-0.01em]">
                  {video.title}
                </h3>
              </DesktopVideoLink>
              <div className="mt-1 flex min-w-0 items-center text-[13px] leading-5 text-muted-foreground">
                {!hideAuthor && (
                  <>
                    <Link to={authorProfileUrl} className="min-w-0 truncate hover:text-primary">
                      {name}
                    </Link>
                    <span aria-hidden="true" className="shrink-0">
                      &nbsp;•&nbsp;
                    </span>
                  </>
                )}
                <div
                  className="shrink-0 whitespace-nowrap"
                  title={formatDate(new Date(getPublishDate(video) * 1000), 'PPpp', {
                    locale: dateLocale,
                  })}
                >
                  {formatDistance(new Date(getPublishDate(video) * 1000), new Date(), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                </div>
              </div>
            </div>
            {/* Hidden until hover on desktop, always reachable on touch. */}
            <UserActionsMenu
              pubkey={video.pubkey}
              videoId={video.id}
              videoTitle={video.title}
              className="relative -mr-1 shrink-0 transition-opacity after:absolute after:-inset-1.5 data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            />
          </div>
        </div>
      </div>
    </div>
  )
})

interface VideoCardSkeletonProps {
  format: 'vertical' | 'horizontal' | 'square'
  fullBleed?: boolean
}

export const VideoCardSkeleton = React.memo(function VideoCardSkeleton({
  format,
  fullBleed = false,
}: VideoCardSkeletonProps) {
  const aspectRatio =
    format == 'vertical' ? 'aspect-[2/3]' : format == 'square' ? 'aspect-[1/1]' : 'aspect-video'
  return (
    <div
      className={cn(
        'px-1 pb-6 sm:px-2',
        fullBleed && format !== 'vertical' && 'px-0 sm:px-2',
        fullBleed && format === 'vertical' && 'p-0 sm:pb-6'
      )}
    >
      <Skeleton
        className={cn(
          'w-full rounded-xl ring-1 ring-inset ring-black/10 dark:ring-white/10',
          fullBleed && 'rounded-none ring-0 sm:rounded-xl sm:ring-1',
          aspectRatio
        )}
      />
      <div
        className={cn(
          'pt-3 px-1',
          fullBleed && (format === 'vertical' ? 'hidden sm:block' : 'px-4 sm:px-1')
        )}
      >
        <div className="flex gap-3">
          {format !== 'vertical' && (
            <div className="shrink-0">
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-2/3 mt-1" />
            <Skeleton className="h-3 w-1/3 mt-1" />
          </div>
        </div>
      </div>
    </div>
  )
})

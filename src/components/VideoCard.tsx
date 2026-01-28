import { Link } from 'react-router-dom'
import { formatDistance } from 'date-fns/formatDistance'
import { type VideoEvent, getPublishDate } from '@/utils/video-event'
import { buildVideoPath, buildVideoUrlObject } from '@/utils/video-utils'
import { formatDuration } from '../lib/formatDuration'
import { UserAvatar } from '@/components/UserAvatar'
import { cn, imageProxyVideoPreview, imageProxyVideoThumbnail } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import React, { useRef, useState, useMemo } from 'react'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
import { PlayProgressBar } from './PlayProgressBar'
import { useProfile } from '@/hooks/useProfile'
import { useEventStore } from 'applesauce-react/hooks'
import { buildProfileUrl } from '@/lib/nprofile'
import { useAppContext } from '@/hooks'
import { useShortsFeedStore } from '@/stores/shortsFeedStore'
import { ImageOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/date-locale'
import { formatDate } from 'date-fns'

interface VideoCardProps {
  video: VideoEvent
  hideAuthor?: boolean
  format: 'vertical' | 'horizontal' | 'square'
  playlistParam?: string
  allVideos?: VideoEvent[] // Full list of videos for shorts navigation
  videoIndex?: number // Index of this video in the allVideos array
}

export const VideoCard = React.memo(function VideoCard({
  video,
  hideAuthor,
  format = 'square',
  playlistParam,
  allVideos,
  videoIndex,
}: VideoCardProps) {
  const { t, i18n } = useTranslation()
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.display_name || metadata?.name || video?.pubkey.slice(0, 8)
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { setVideos } = useShortsFeedStore()

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

  const aspectRatio =
    format == 'vertical' ? 'aspect-[2/3]' : format == 'square' ? 'aspect-[1/1]' : 'aspect-video'

  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false)
  // Check if we have no thumbnail at all - immediately mark as failed
  const hasNoThumbnail = !video.images || video.images.length === 0 || !video.images[0]
  const [fallbackFailed, setFallbackFailed] = useState(hasNoThumbnail)

  // Hover preview disabled - causes unnecessary bandwidth usage
  const hoverPreviewEnabled = false

  // Generate thumbnail URL with fallback to video URL if image fails
  const thumbnailUrl = useMemo(() => {
    // If no thumbnail exists, return empty string
    if (hasNoThumbnail) {
      return ''
    }
    // If thumbnail failed and we have video URLs, try generating thumbnail from video
    if (thumbnailError && video.urls && video.urls.length > 0) {
      return imageProxyVideoThumbnail(video.urls[0], config.thumbResizeServerUrl)
    }
    // Otherwise use the original image thumbnail
    return imageProxyVideoPreview(video.images[0], config.thumbResizeServerUrl)
  }, [hasNoThumbnail, thumbnailError, video.images, video.urls, config.thumbResizeServerUrl])

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

  // Debug: Log navigation state for shorts (DEV only)
  if (import.meta.env.DEV && video.type === 'shorts') {
    console.log('[VideoCard] Creating shorts link:', {
      videoTitle: video.title,
      videoType: video.type,
      hasAllVideos: !!allVideos,
      allVideosCount: allVideos?.length,
      videoIndex,
      willPassState: !!(allVideos && videoIndex !== undefined),
      toValue: to,
      toType: typeof to,
    })
  }

  const handleMouseEnter = () => {
    // don't show hover preview for video with content warning (when warning mode is active)
    if (showNsfwWarning) return

    if (video) {
      setIsHovered(true)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    setVideoLoaded(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  const handleVideoLoadedData = () => {
    setVideoLoaded(true)
    videoRef.current?.play().catch(error => console.error('Video autoplay blocked:', error))
  }

  const handleThumbnailError = () => {
    console.warn('Thumbnail failed to load:', video.images[0])
    // Only try video fallback once to avoid infinite loops
    if (!thumbnailError) {
      setThumbnailError(true)
      setThumbnailLoaded(false) // Reset loaded state for fallback
    } else {
      // Fallback also failed, mark as completely failed
      setFallbackFailed(true)
    }
  }

  const handleThumbnailLoad = () => {
    setThumbnailLoaded(true)
  }

  // Handle shorts click - populate store with video list
  const handleShortsClick = () => {
    if (video.type === 'shorts' && allVideos && videoIndex !== undefined) {
      if (import.meta.env.DEV) {
        console.log('[VideoCard] Populating store with shorts:', {
          videoCount: allVideos.length,
          startIndex: videoIndex,
          clickedTitle: video.title,
        })
      }

      // Populate the store with the shorts list and starting index
      setVideos(allVideos, videoIndex)
    }
  }

  return (
    <div
      className="p-2 pb-4 hover:bg-accent rounded-lg transition-all duration-300 group hover:shadow-md hover:scale-[1.02]"
      style={{ contain: 'layout style paint' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div>
        <Link to={to} onClick={handleShortsClick}>
          {/* Container with fixed aspect ratio ensures consistent size regardless of thumbnail state */}
          <div className={cn('w-full overflow-hidden sm:rounded-lg relative', aspectRatio)}>
            {/* Show error state if both thumbnail and fallback failed */}
            {fallbackFailed ? (
              <div className="absolute inset-0 bg-muted flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="h-12 w-12" />
                  <span className="text-sm">{t('video.thumbnailUnavailable')}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Placeholder shown while thumbnail loads - blurhash or skeleton */}
                {!thumbnailLoaded &&
                  (blurhashPlaceholder ? (
                    <img
                      src={blurhashPlaceholder}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <Skeleton className="absolute inset-0 w-full h-full" />
                  ))}
                <img
                  src={thumbnailUrl}
                  loading="lazy"
                  alt={video.title}
                  referrerPolicy="no-referrer"
                  className={cn(
                    showNsfwWarning ? 'blur-lg' : '',
                    'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                    isHovered && videoLoaded ? 'opacity-0' : 'opacity-100',
                    !thumbnailLoaded && 'opacity-0'
                  )}
                  onError={handleThumbnailError}
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
            {/* Progress bar at bottom of thumbnail */}
            <PlayProgressBar videoId={video.id} duration={video.duration} />
            {isHovered && hoverPreviewEnabled && video.urls && video.urls.length > 0 && (
              <video
                ref={videoRef}
                src={video.urls[0]}
                muted
                autoPlay={false}
                loop
                playsInline
                preload="metadata"
                onLoadedData={handleVideoLoadedData}
                className={cn(
                  'absolute inset-0 w-full h-full object-cover sm:rounded-lg transition-opacity duration-300',
                  videoLoaded ? 'opacity-100' : 'opacity-0 hidden'
                )}
              />
            )}
            {video.duration > 0 && (
              <div className="absolute bottom-2 right-2 bg-black/50 text-white px-1 rounded text-sm">
                {formatDuration(video.duration)}
              </div>
            )}
          </div>
        </Link>
        <div className="pt-3">
          <div className="flex gap-3">
            {!hideAuthor && format !== 'vertical' && (
              <Link to={authorProfileUrl} className="shrink-0">
                <UserAvatar
                  picture={metadata?.picture}
                  pubkey={video.pubkey}
                  name={name}
                  thumbResizeServerUrl={config.thumbResizeServerUrl}
                  className="h-10 w-10"
                />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <Link to={to}>
                <h3 className="font-medium line-clamp-2 break-all">{video.title}</h3>
              </Link>
              <div className="flex items-center text-xs">
                {!hideAuthor && (
                  <>
                    <Link
                      to={authorProfileUrl}
                      className="block text-muted-foreground hover:text-primary"
                    >
                      {name}
                    </Link>
                  </>
                )}
                {name && <>&nbsp;•&nbsp;</>}
                <div
                  className="text-muted-foreground"
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
          </div>
        </div>
      </div>
    </div>
  )
})

interface VideoCardSkeletonProps {
  format: 'vertical' | 'horizontal' | 'square'
}

export const VideoCardSkeleton = React.memo(function VideoCardSkeleton({
  format,
}: VideoCardSkeletonProps) {
  const aspectRatio =
    format == 'vertical' ? 'aspect-[2/3]' : format == 'square' ? 'aspect-[1/1]' : 'aspect-video'
  return (
    <div className="p-2">
      <Skeleton className={cn('w-full', aspectRatio)} />
      <div className="pt-3">
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

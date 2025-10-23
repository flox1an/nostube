import { Link } from 'react-router-dom'
import { formatDistance } from 'date-fns'
import { VideoEvent } from '@/utils/video-event'
import { nip19 } from 'nostr-tools'
import { formatDuration } from '../lib/formatDuration'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, imageProxy, imageProxyVideoPreview } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import React, { useRef, useState } from 'react'
import { PlayProgressBar } from './PlayProgressBar'
import { useProfile } from '@/hooks/useProfile'

interface VideoCardProps {
  video: VideoEvent
  hideAuthor?: boolean
  format: 'vertical' | 'horizontal' | 'square'
}

export function VideoCard({ video, hideAuthor, format = 'square' }: VideoCardProps) {
  const metadata = useProfile({ pubkey: video.pubkey })
  const name = metadata?.display_name || metadata?.name || video?.pubkey.slice(0, 8)

  const aspectRatio =
    format == 'vertical' ? 'aspect-[2/3]' : format == 'square' ? 'aspect-[1/1]' : 'aspect-video'
  const maxWidth = format == 'vertical' && 'sm:max-w-[280px] mx-auto'

  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)

  const hoverPreviewEnabled = false

  const handleMouseEnter = () => {
    // don't show hover preview for video with content warning
    if (video.contentWarning) return

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

  return (
    <div
      className={cn('transition-all duration-200', maxWidth)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="p-0">
        <Link to={`/video/${video.link}`}>
          <div className="w-full overflow-hidden rounded-lg relative">
            <img
              src={imageProxyVideoPreview(video.images[0])}
              loading="lazy"
              alt={video.title}
              referrerPolicy="no-referrer"
              className={cn(
                video.contentWarning ? 'blur-lg' : '',
                'w-full object-cover transition-opacity duration-300',
                aspectRatio,
                isHovered && videoLoaded ? 'opacity-0 absolute' : 'opacity-100'
              )}
              onError={err => console.error('error loading', video.images[0], err)}
            />
            {video.contentWarning && (
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
                  'w-full object-cover rounded-lg transition-opacity duration-300',
                  aspectRatio,
                  videoLoaded ? 'opacity-100' : 'opacity-0 hidden'
                )}
              />
            )}
            {video.duration > 0 && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white px-1 rounded text-sm">
                {formatDuration(video.duration)}
              </div>
            )}
          </div>
        </Link>
        <div className="pt-3">
          <div className="flex gap-3">
            {!hideAuthor && (
              <Link to={`/author/${nip19.npubEncode(video.pubkey)}`} className="shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={imageProxy(metadata?.picture)} alt={name} />
                  <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                </Avatar>
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <Link to={`/video/${video.link}`}>
                <h3 className="font-medium line-clamp-2 break-all">{video.title}</h3>
              </Link>

              {!hideAuthor && (
                <Link
                  to={`/author/${nip19.npubEncode(video.pubkey)}`}
                  className="block text-sm mt-1 text-muted-foreground hover:text-primary"
                >
                  {name}
                </Link>
              )}

              <div className="text-xs text-muted-foreground">
                {formatDistance(new Date(video.created_at * 1000), new Date(), {
                  addSuffix: true,
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface VideoCardSkeletonProps {
  format: 'vertical' | 'horizontal' | 'square'
}

export function VideoCardSkeleton({ format }: VideoCardSkeletonProps) {
  const aspectRatio =
    format == 'vertical' ? 'aspect-[2/3]' : format == 'square' ? 'aspect-[1/1]' : 'aspect-video'
  return (
    <div className="p-0">
      <Skeleton className={cn('w-full', aspectRatio)} />
      <div className="pt-3">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      </div>
    </div>
  )
}

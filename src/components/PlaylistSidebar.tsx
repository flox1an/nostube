import { Link } from 'react-router-dom'
import { UserAvatar } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { imageProxyVideoPreview, imageProxyVideoThumbnail, cn } from '@/lib/utils'
import { buildVideoUrl } from '@/utils/video-utils'
import { useProfile, useAppContext } from '@/hooks'
import { useMemo, useState } from 'react'

interface PlaylistVideoItem {
  id: string
  pubkey?: string
  title?: string
  images?: string[]
  urls?: string[]
  link: string
}

interface PlaylistVideoItemProps {
  item: PlaylistVideoItem
  isActive: boolean
  href: string
}

// Component for rendering individual playlist video item with author info
const PlaylistVideoItem = ({ item, isActive, href }: PlaylistVideoItemProps) => {
  const { config } = useAppContext()
  const metadata = useProfile(item.pubkey ? { pubkey: item.pubkey } : undefined)
  const authorName = metadata?.display_name ?? metadata?.name ?? item.pubkey?.slice(0, 8) ?? ''
  const authorPicture = metadata?.picture
  const [thumbnailError, setThumbnailError] = useState(false)

  const thumbnail = item.images?.[0]

  const thumbnailUrl = useMemo(() => {
    if (!thumbnail) return null
    // If thumbnail failed and we have video URLs, try generating thumbnail from video
    if (thumbnailError && item.urls && item.urls.length > 0) {
      return imageProxyVideoThumbnail(item.urls[0], config.thumbResizeServerUrl)
    }
    // Otherwise use the original image thumbnail
    return imageProxyVideoPreview(thumbnail, config.thumbResizeServerUrl)
  }, [thumbnailError, thumbnail, item.urls, config.thumbResizeServerUrl])

  const handleThumbnailError = () => {
    console.warn('Thumbnail failed to load:', thumbnail)
    if (!thumbnailError) {
      setThumbnailError(true)
    }
  }

  return (
    <Link
      to={href}
      className={cn(
        'flex gap-3 rounded-lg border border-transparent p-2 transition hover:border-border hover:bg-muted',
        isActive && 'border-primary'
      )}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={item.title || 'Playlist video'}
          className="w-40 h-24 shrink-0 rounded-md object-cover"
          onError={handleThumbnailError}
        />
      ) : (
        <div className="w-40 h-24 shrink-0 rounded-md bg-muted text-xs text-muted-foreground flex items-center justify-center">
          No image
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium line-clamp-2">{item.title || 'Untitled Video'}</p>
        <div className="flex items-center gap-1.5">
          <UserAvatar
            picture={authorPicture}
            pubkey={item.pubkey}
            name={authorName}
            className="h-4 w-4"
          />
          <p className="text-xs text-muted-foreground truncate">{authorName}</p>
        </div>
        {isActive && <Badge variant="default">Now playing</Badge>}
      </div>
    </Link>
  )
}

interface PlaylistSidebarProps {
  playlistParam: string | null
  currentVideoId?: string
  playlistEvent: unknown
  playlistTitle: string
  playlistDescription: string
  videoEvents: PlaylistVideoItem[]
  isLoadingPlaylist: boolean
  isLoadingVideos: boolean
  failedVideoIds: Set<string>
  loadingVideoIds: Set<string>
}

export function PlaylistSidebar({
  playlistParam,
  currentVideoId,
  playlistEvent,
  playlistTitle,
  playlistDescription,
  videoEvents,
  isLoadingPlaylist,
  isLoadingVideos,
  failedVideoIds,
  loadingVideoIds,
}: PlaylistSidebarProps) {
  if (isLoadingPlaylist) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-16 w-28 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!playlistEvent) {
    return (
      <Alert variant="default">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Playlist unavailable</AlertTitle>
        <AlertDescription>
          We couldn't load this playlist. It may have been deleted or is unreachable.
        </AlertDescription>
      </Alert>
    )
  }

  const videoCountText = `${videoEvents.length} video${videoEvents.length === 1 ? '' : 's'}`

  if (!playlistParam) return null

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="text-lg font-semibold truncate">{playlistTitle || 'Playlist'}</h2>
          <p className="text-xs text-muted-foreground line-clamp-2">
            Playlist | {playlistDescription || videoCountText}
          </p>
        </div>
        <Link
          to={`/playlist/${playlistParam}`}
          className="text-xs text-primary hover:underline shrink-0 self-center"
        >
          View all
        </Link>
      </div>

      <div className="">
        {videoEvents.length === 0 && !isLoadingVideos ? (
          <div className="text-sm text-muted-foreground">No videos in this playlist yet.</div>
        ) : (
          videoEvents.map(item => {
            const isActive = currentVideoId === item.id
            const href = buildVideoUrl(item.link, 'video', { playlist: playlistParam })

            return <PlaylistVideoItem key={item.id} item={item} isActive={isActive} href={href} />
          })
        )}

        {(isLoadingVideos || loadingVideoIds.size > 0) &&
          Array.from({ length: Math.max(1, loadingVideoIds.size) }).map((_, idx) => (
            <div key={`playlist-loading-${idx}`} className="flex gap-3">
              <Skeleton className="h-16 w-28 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
      </div>

      {failedVideoIds.size > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {failedVideoIds.size} playlist video
            {failedVideoIds.size === 1 ? '' : 's'} could not be loaded.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

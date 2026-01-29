import { useMemo, useState, useEffect } from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { List } from 'lucide-react'
import { cn, imageProxyVideoPreview } from '@/lib/utils'
import { useAppContext, useStableRelays } from '@/hooks'
import { processEvent } from '@/utils/video-event'
import { createEventLoader } from 'applesauce-loaders/loaders'

interface ThumbnailItemProps {
  videoId: string
  className?: string
}

function ThumbnailItem({ videoId, className }: ThumbnailItemProps) {
  const eventStore = useEventStore()
  const { config, pool } = useAppContext()
  const relays = useStableRelays()
  const [error, setError] = useState(false)

  // Subscribe to event changes reactively
  const event = use$(() => eventStore.event(videoId), [eventStore, videoId])

  // Load event if not in store
  useEffect(() => {
    if (!videoId || eventStore.getEvent(videoId)) return

    const loader = createEventLoader(pool, { eventStore, extraRelays: relays })
    const sub = loader({ id: videoId }).subscribe({
      next: e => eventStore.add(e),
      error: () => {}, // Ignore errors silently
    })

    return () => sub.unsubscribe()
  }, [videoId, eventStore, pool, relays])

  const thumbnailUrl = useMemo(() => {
    if (!event) return null
    const processed = processEvent(event, [], config.blossomServers)
    return processed?.images?.[0] || null
  }, [event, config.blossomServers])

  if (!thumbnailUrl || error) {
    return (
      <div className={cn('bg-muted flex items-center justify-center', className)}>
        <List className="h-6 w-6 text-muted-foreground/50" />
      </div>
    )
  }

  return (
    <img
      src={imageProxyVideoPreview(thumbnailUrl, config.thumbResizeServerUrl)}
      alt=""
      className={cn('object-cover', className)}
      loading="lazy"
      onError={() => setError(true)}
    />
  )
}

interface PlaylistThumbnailCollageProps {
  videoIds: string[]
  className?: string
}

export function PlaylistThumbnailCollage({ videoIds, className }: PlaylistThumbnailCollageProps) {
  const count = videoIds.length

  // Empty playlist - show icon
  if (count === 0) {
    return (
      <div
        className={cn(
          'aspect-video bg-muted rounded-t-lg flex items-center justify-center',
          className
        )}
      >
        <List className="h-10 w-10 text-muted-foreground/40" />
      </div>
    )
  }

  // 1 video - full cover
  if (count === 1) {
    return (
      <div className={cn('aspect-video rounded-t-lg overflow-hidden', className)}>
        <ThumbnailItem videoId={videoIds[0]} className="w-full h-full" />
      </div>
    )
  }

  // 2 videos - 50/50 split
  if (count === 2) {
    return (
      <div className={cn('aspect-video rounded-t-lg overflow-hidden grid grid-cols-2', className)}>
        <ThumbnailItem videoId={videoIds[0]} className="w-full h-full" />
        <ThumbnailItem videoId={videoIds[1]} className="w-full h-full" />
      </div>
    )
  }

  // 3 videos - large left, two stacked right
  if (count === 3) {
    return (
      <div className={cn('aspect-video rounded-t-lg overflow-hidden grid grid-cols-2', className)}>
        <ThumbnailItem videoId={videoIds[0]} className="w-full h-full" />
        <div className="grid grid-rows-2">
          <ThumbnailItem videoId={videoIds[1]} className="w-full h-full" />
          <ThumbnailItem videoId={videoIds[2]} className="w-full h-full" />
        </div>
      </div>
    )
  }

  // 4+ videos - 2x2 grid
  return (
    <div
      className={cn(
        'aspect-video rounded-t-lg overflow-hidden grid grid-cols-2 grid-rows-2',
        className
      )}
    >
      <ThumbnailItem videoId={videoIds[0]} className="w-full h-full" />
      <ThumbnailItem videoId={videoIds[1]} className="w-full h-full" />
      <ThumbnailItem videoId={videoIds[2]} className="w-full h-full" />
      <ThumbnailItem videoId={videoIds[3]} className="w-full h-full" />
    </div>
  )
}

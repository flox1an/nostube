import { useMemo, useEffect } from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAppContext, useStableRelays } from '@/hooks'
import { useImageCascade } from '@/hooks/useImageCascade'
import type { ValidationStatus } from '@/hooks/usePlaylistValidation'
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

  const cascade = useImageCascade({
    src: thumbnailUrl,
    variant: 'preview',
  })

  if (!cascade.src) {
    return (
      <div className={cn('bg-muted flex items-center justify-center', className)}>
        <List className="h-6 w-6 text-muted-foreground/50" />
      </div>
    )
  }

  return (
    <img
      src={cascade.src}
      alt=""
      className={cn('object-cover', className)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={cascade.onError}
      onLoad={cascade.onLoad}
    />
  )
}

interface PlaylistThumbnailCollageProps {
  videoIds: string[]
  safetyState?: ValidationStatus
  contentWarning?: string
  className?: string
}

function PlaylistThumbnailGrid({
  videoIds,
  className,
}: Pick<PlaylistThumbnailCollageProps, 'videoIds' | 'className'>) {
  const count = videoIds.length

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

  if (count === 1) {
    return (
      <div className={cn('aspect-video rounded-t-lg overflow-hidden', className)}>
        <ThumbnailItem videoId={videoIds[0]} className="w-full h-full" />
      </div>
    )
  }

  if (count === 2) {
    return (
      <div className={cn('aspect-video rounded-t-lg overflow-hidden grid grid-cols-2', className)}>
        <ThumbnailItem videoId={videoIds[0]} className="w-full h-full" />
        <ThumbnailItem videoId={videoIds[1]} className="w-full h-full" />
      </div>
    )
  }

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

export function PlaylistThumbnailCollage({
  videoIds,
  safetyState = 'clean',
  contentWarning,
  className,
}: PlaylistThumbnailCollageProps) {
  const { t } = useTranslation()

  if (safetyState === 'pending') {
    return (
      <div
        role="status"
        aria-label={t('contentSafety.loading')}
        className={cn(
          'aspect-video rounded-t-lg bg-muted flex items-center justify-center',
          className
        )}
      >
        <List className="h-10 w-10 text-muted-foreground/40" />
      </div>
    )
  }

  if (safetyState === 'unsafe') {
    return (
      <div className="relative aspect-video overflow-hidden rounded-t-lg">
        <PlaylistThumbnailGrid
          videoIds={videoIds}
          className={cn('h-full w-full scale-105 blur-lg', className)}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 px-3 text-center text-white">
          <span className="text-lg font-bold drop-shadow-lg">
            {t('contentSafety.warning.title')}
          </span>
          {contentWarning && (
            <span className="mt-2 text-sm font-semibold drop-shadow-lg">{contentWarning}</span>
          )}
        </div>
      </div>
    )
  }

  return <PlaylistThumbnailGrid videoIds={videoIds} className={className} />
}

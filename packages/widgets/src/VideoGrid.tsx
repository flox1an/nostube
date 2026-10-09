import type { VideoEvent } from '@nostube/core/video-event'
import { Skeleton } from './components/skeleton'
import { VideoCard } from './VideoCard'

export interface VideoGridProps {
  videos: VideoEvent[]
  onSelect?: (video: VideoEvent) => void
  /** Videos for which this returns true render as locked cards. */
  isLocked?: (video: VideoEvent) => boolean
  /** Shown instead of the grid when there are no videos. */
  emptyMessage?: string
}

export function VideoGrid({
  videos,
  onSelect,
  isLocked,
  emptyMessage = 'No videos yet.',
}: VideoGridProps) {
  if (videos.length === 0) {
    return <p className="py-12 text-center text-neutral-500">{emptyMessage}</p>
  }
  return (
    <ul className={GRID_CLASSES}>
      {videos.map(video => (
        <li key={video.id}>
          <VideoCard video={video} onSelect={onSelect} locked={isLocked?.(video)} />
        </li>
      ))}
    </ul>
  )
}

const GRID_CLASSES = 'grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

/**
 * Placeholder cards with the size of the real ones, shown while the first page loads. Like the
 * cards, they are meant to run edge to edge on a phone: the page lets the grid bleed (`-mx-4`).
 */
export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={GRID_CLASSES} aria-busy="true" aria-label="Loading videos">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-video w-full rounded-none sm:rounded-lg" />
          <Skeleton className="mx-4 h-4 w-4/5 sm:mx-0" />
          <Skeleton className="mx-4 h-3 w-1/3 sm:mx-0" />
        </li>
      ))}
    </ul>
  )
}

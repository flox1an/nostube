import type { VideoEvent } from '@nostube/core/video-event'
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
    <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map(video => (
        <li key={video.id}>
          <VideoCard video={video} onSelect={onSelect} locked={isLocked?.(video)} />
        </li>
      ))}
    </ul>
  )
}

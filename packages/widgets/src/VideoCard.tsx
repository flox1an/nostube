import { useState } from 'react'
import type { VideoEvent } from '@nostube/core/video-event'
import { getPublishDate } from '@nostube/core/video-event'
import { formatDate, formatDuration } from './format'

export interface VideoCardProps {
  video: VideoEvent
  /** Called when the card is activated. The app decides what happens (route, inline player). */
  onSelect?: (video: VideoEvent) => void
}

/** Thumbnail, title, duration and date of one video. Styling is Tailwind utilities only. */
export function VideoCard({ video, onSelect }: VideoCardProps) {
  const thumbnail = video.thumbnailVariants[0]?.url ?? video.images[0]
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => onSelect?.(video)}
      className="group flex flex-col gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <span className="relative block aspect-video overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800">
        {thumbnail && !thumbnailFailed && (
          <img
            src={thumbnail}
            onError={() => setThumbnailFailed(true)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
        {video.duration > 0 && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">
            {formatDuration(video.duration)}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-sm font-medium">{video.title}</span>
      <span className="text-xs text-neutral-500">{formatDate(getPublishDate(video))}</span>
    </button>
  )
}

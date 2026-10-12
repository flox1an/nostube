import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VideoEvent } from '@nostube/core/video-event'
import { getPublishDate } from '@nostube/core/video-event'
import { formatDate, formatDuration } from './format'

export interface VideoCardProps {
  video: VideoEvent
  /** Called when the card is activated. The app decides what happens (route, inline player). */
  onSelect?: (video: VideoEvent) => void
  /** Show a placeholder instead of the thumbnail (content the viewer has not unlocked yet). */
  locked?: boolean
  lockedLabel?: string
  /**
   * The card's URL. With it the card is a link (new tab, copy link, crawlers); a plain left click
   * still goes to `onSelect` so the app keeps its routing and age gate.
   */
  href?: string
}

/** Thumbnail, title, duration and date of one video. Styling is Tailwind utilities only. */
export function VideoCard({ video, onSelect, locked = false, lockedLabel, href }: VideoCardProps) {
  const { t, i18n } = useTranslation()
  const thumbnail = video.thumbnailVariants[0]?.url ?? video.images[0]
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const className =
    'group flex w-full flex-col gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500'
  const body = (
    <>
      <span className="relative block aspect-video overflow-hidden bg-neutral-200 sm:rounded-lg dark:bg-neutral-800">
        {locked && (
          <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-neutral-400">
            {lockedLabel ?? t('video.grid.contentWarning')}
          </span>
        )}
        {!locked && thumbnail && !thumbnailFailed && (
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
      <span className="line-clamp-2 px-4 text-sm font-medium sm:px-0">{video.title}</span>
      <span className="px-4 text-xs text-neutral-500 sm:px-0">
        {formatDate(getPublishDate(video), i18n.resolvedLanguage)}
      </span>
    </>
  )
  if (href) {
    return (
      <a
        href={href}
        className={className}
        onClick={event => {
          const plain =
            event.button === 0 &&
            !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          if (!onSelect || !plain) return
          event.preventDefault()
          onSelect(video)
        }}
      >
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={() => onSelect?.(video)} className={className}>
      {body}
    </button>
  )
}

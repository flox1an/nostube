import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { videoRef } from '@nostube/core/hidden-videos'
import type { VideoEvent } from '@nostube/core/video-event'
import { getPublishDate } from '@nostube/core/video-event'
import { formatDate } from '@nostube/widgets'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { Switch } from '@nostube/widgets/components/switch'
import { useCreatorVideos } from '@nostube/widgets/hooks/useCreatorVideos'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { isRefHidden, setRefHidden } from './draft'
import { bootInstanceClient, type InstanceClient } from './instance-client'

interface PickerProps {
  hiddenText: string
  onChange: (hiddenText: string) => void
}

/** The creator's videos with a switch each: what is switched on is hidden on the public site. */
export default function HiddenVideosPicker(props: PickerProps) {
  const { t } = useTranslation()
  const [booted, setBooted] = useState<InstanceClient | Error | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, e =>
      setBooted(e instanceof Error ? e : new Error(String(e)))
    )
  }, [])

  if (booted === null) return <Skeleton className="h-40 w-full" />
  if (booted instanceof Error) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('studio.videos.loadFailedWith', { message: booted.message })}
      </p>
    )
  }
  return (
    <InstanceProviders client={booted.client} config={booted.config}>
      <VideoList config={booted.config} {...props} />
    </InstanceProviders>
  )
}

function VideoList({
  config,
  hiddenText,
  onChange,
}: PickerProps & { config: InstanceClient['config'] }) {
  const { t } = useTranslation()
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config)

  if (!config.startPage) {
    return <p className="text-sm text-muted-foreground">{t('studio.videos.addCreator')}</p>
  }
  if (loading) return <Skeleton className="h-40 w-full" />
  if (error) return <p className="text-sm text-destructive">{t('studio.videos.loadFailed')}</p>
  if (videos.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studio.videos.none')}</p>
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-md border border-border">
        {videos.map(video => (
          <Row
            key={video.id}
            video={video}
            hidden={isRefHidden(hiddenText, videoRef(video)) || isRefHidden(hiddenText, video.id)}
            onToggle={on => onChange(setRefHidden(hiddenText, [videoRef(video), video.id], on))}
          />
        ))}
      </ul>
      {hasMore && (
        <Button type="button" variant="outline" size="sm" onClick={loadMore}>
          {t('studio.videos.loadMore')}
        </Button>
      )}
    </div>
  )
}

function Row({
  video,
  hidden,
  onToggle,
}: {
  video: VideoEvent
  hidden: boolean
  onToggle: (hidden: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const thumbnail = video.thumbnailVariants[0]?.url ?? video.images[0]
  return (
    <li className="flex items-center gap-3 p-2">
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded bg-muted">
        {thumbnail && !video.contentWarning && (
          <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${hidden ? 'text-muted-foreground line-through' : ''}`}
        >
          {video.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(getPublishDate(video), i18n.resolvedLanguage)}
          {video.contentWarning ? ` · ${t('studio.videos.contentWarning')}` : ''}
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {t('studio.videos.hidden')}
        <Switch
          checked={hidden}
          onCheckedChange={onToggle}
          aria-label={t('studio.videos.hide', { title: video.title })}
        />
      </label>
    </li>
  )
}

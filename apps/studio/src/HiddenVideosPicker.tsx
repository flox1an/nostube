import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { videoRef } from '@nostube/core/hidden-videos'
import type { VideoEvent } from '@nostube/core/video-event'
import { getPublishDate } from '@nostube/core/video-event'
import { formatDate } from '@nostube/widgets'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { useCreatorVideos } from '@nostube/widgets/hooks/useCreatorVideos'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { isRefHidden, setRefHidden } from './draft'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { VideoActions } from './VideoActions'
import { useSigner } from './signer-context'

interface PickerProps {
  hiddenText: string
  /** Saves the hidden list at once (the server applies it without a restart). */
  onChange: (hiddenText: string) => Promise<void>
}

/** The creator's videos, each with its actions; hiding one applies to the public site at once. */
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
      <VideoList instance={booted} config={booted.config} {...props} />
    </InstanceProviders>
  )
}

function VideoList({
  config,
  instance,
  hiddenText,
  onChange,
}: PickerProps & { config: InstanceClient['config']; instance: InstanceClient }) {
  const { t } = useTranslation()
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config)
  const { signer, pubkey, connect } = useSigner()
  const [connectError, setConnectError] = useState<string | null>(null)
  const [hideBusy, setHideBusy] = useState(false)
  const [hideError, setHideError] = useState<string | null>(null)
  const setHidden = async (refs: string[], on: boolean) => {
    setHideBusy(true)
    setHideError(null)
    try {
      await onChange(setRefHidden(hiddenText, refs, on))
    } catch (e) {
      setHideError(e instanceof Error ? e.message : String(e))
    } finally {
      setHideBusy(false)
    }
  }

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
      {signer && !pubkey && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setConnectError(null)
            void connect().catch(e => setConnectError(e instanceof Error ? e.message : String(e)))
          }}
        >
          {t('studio.videos.connect')}
        </Button>
      )}
      {(connectError || hideError) && (
        <p role="alert" className="text-sm text-destructive">
          {connectError ?? hideError}
        </p>
      )}
      <ul className="divide-y divide-border rounded-md border border-border">
        {videos.map(video => (
          <Row
            key={videoRef(video)}
            video={video}
            instance={instance}
            hidden={isRefHidden(hiddenText, videoRef(video)) || isRefHidden(hiddenText, video.id)}
            hideBusy={hideBusy}
            onHiddenChange={on => void setHidden([videoRef(video), video.id], on)}
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
  instance,
  hidden,
  hideBusy,
  onHiddenChange,
}: {
  video: VideoEvent
  instance: InstanceClient
  hidden: boolean
  hideBusy: boolean
  onHiddenChange: (hidden: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const thumbnail = video.thumbnailVariants[0]?.url ?? video.images[0]
  return (
    <li className="flex flex-wrap items-center gap-3 p-2">
      <div
        className={`h-12 w-20 shrink-0 overflow-hidden rounded bg-muted ${hidden ? 'opacity-50' : ''}`}
      >
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
          {hidden ? ` · ${t('studio.videos.hidden')}` : ''}
        </p>
      </div>
      <VideoActions
        video={video}
        instance={instance}
        hidden={hidden}
        hideBusy={hideBusy}
        onHiddenChange={onHiddenChange}
      />
    </li>
  )
}

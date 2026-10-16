import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Video } from 'lucide-react'
import { videoRef } from '@nostube/core/hidden-videos'
import type { VideoEvent } from '@nostube/core/video-event'
import { getPublishDate } from '@nostube/core/video-event'
import { formatDate, formatDuration } from '@nostube/widgets'
import { Badge } from '@nostube/widgets/components/badge'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@nostube/widgets/components/toggle-group'
import { useCreatorVideos } from '@nostube/widgets/hooks/useCreatorVideos'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { loadPlays } from './api'
import { isRefHidden, setRefHidden } from './draft'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { VideoActions } from './VideoActions'
import { hashFor } from './route'

/** Fewer videos than this fit on a screen; more get a search box. */
const SEARCH_FROM = 6

/** The periods the play counts cover, in days. */
const PLAY_PERIODS = [7, 30, 365]

interface PickerProps {
  hiddenText: string
  /** Saves the hidden list at once (the server applies it without a restart). */
  onChange: (hiddenText: string) => Promise<void>
  /** The server counts plays (saved config): videos without plays show 0. */
  countPlays: boolean
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
  countPlays,
}: PickerProps & { config: InstanceClient['config']; instance: InstanceClient }) {
  const { t } = useTranslation()
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config)
  const [hideBusy, setHideBusy] = useState(false)
  const [hideError, setHideError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [days, setDays] = useState(30)
  const [sort, setSort] = useState<'newest' | 'plays'>('newest')
  // Plays per video event id; the previous period's stay while the next loads. Null: none known.
  const [plays, setPlays] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    let live = true
    loadPlays(days).then(
      p => live && setPlays(p),
      () => live && setPlays(null)
    )
    return () => {
      live = false
    }
  }, [days])
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
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-8 text-center">
        <Video className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{t('studio.videos.emptyTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('studio.videos.emptyHint')}</p>
        <Button asChild>
          <a href={hashFor('upload')}>
            <Upload className="mr-2 h-4 w-4" />
            {t('studio.nav.pages.upload')}
          </a>
        </Button>
      </div>
    )
  }
  const needle = query.trim().toLowerCase()
  const found = needle ? videos.filter(v => v.title.toLowerCase().includes(needle)) : videos
  // ponytail: sorts the videos loaded so far; "Load more" may bring more-played ones.
  const shown =
    sort === 'plays' && plays
      ? [...found].sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0))
      : found
  const showPlays = countPlays || (plays !== null && Object.keys(plays).length > 0)

  return (
    <div className="space-y-3">
      {hideError && (
        <p role="alert" className="text-sm text-destructive">
          {hideError}
        </p>
      )}
      {videos.length >= SEARCH_FROM && (
        <Input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('studio.videos.search')}
          aria-label={t('studio.videos.search')}
        />
      )}
      {showPlays && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            aria-label={t('studio.videos.plays.period')}
            value={String(days)}
            onValueChange={v => v && setDays(Number(v))}
          >
            {PLAY_PERIODS.map(n => (
              <ToggleGroupItem key={n} value={String(n)}>
                {t('studio.videos.plays.lastDays', { count: n })}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            aria-label={t('studio.videos.plays.sort')}
            value={sort}
            onValueChange={v => v && setSort(v as typeof sort)}
          >
            <ToggleGroupItem value="newest">{t('studio.videos.plays.newest')}</ToggleGroupItem>
            <ToggleGroupItem value="plays">{t('studio.videos.plays.most')}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('studio.videos.noMatch')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {shown.map(video => (
            <Row
              key={videoRef(video)}
              video={video}
              instance={instance}
              plays={plays?.[video.id] ?? (countPlays && plays ? 0 : undefined)}
              hidden={isRefHidden(hiddenText, videoRef(video)) || isRefHidden(hiddenText, video.id)}
              hideBusy={hideBusy}
              onHiddenChange={on => void setHidden([videoRef(video), video.id], on)}
            />
          ))}
        </ul>
      )}
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
  plays,
  hidden,
  hideBusy,
  onHiddenChange,
}: {
  video: VideoEvent
  instance: InstanceClient
  /** Plays in the chosen period; undefined shows none. */
  plays: number | undefined
  hidden: boolean
  hideBusy: boolean
  onHiddenChange: (hidden: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const thumbnail = video.thumbnailVariants[0]?.url ?? video.images[0]
  return (
    <li className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 p-2 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
      <div
        className={`h-12 w-20 shrink-0 overflow-hidden rounded bg-muted ${hidden ? 'opacity-50' : ''}`}
      >
        {thumbnail && !video.contentWarning && (
          <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 break-words text-sm font-medium ${hidden ? 'text-muted-foreground' : ''}`}
        >
          {video.title}
        </p>
        <div className="text-xs text-muted-foreground">
          {formatDate(getPublishDate(video), i18n.resolvedLanguage)}
          {video.duration > 0 ? ` · ${formatDuration(video.duration)}` : ''}
          {plays !== undefined ? ` · ${t('studio.videos.plays.count', { count: plays })}` : ''}
          {video.contentWarning ? ` · ${t('studio.videos.contentWarning')}` : ''}
          {hidden && (
            <Badge variant="secondary" className="ml-1">
              {t('studio.videos.hidden')}
            </Badge>
          )}
        </div>
      </div>
      <div className="col-span-2 flex justify-end sm:col-span-1">
        <VideoActions
          video={video}
          instance={instance}
          hidden={hidden}
          hideBusy={hideBusy}
          onHiddenChange={onHiddenChange}
        />
      </div>
    </li>
  )
}

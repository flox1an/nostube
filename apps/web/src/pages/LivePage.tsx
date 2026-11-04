import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Radio, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveStream } from '@nostube/core/live-stream'
import { getVideoPlayback } from '@nostube/core/content-safety'
import { pageTitle } from '@nostube/core/instance-config'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useLiveStreams } from '@/hooks/useLiveStreams'
import { useAppContext } from '@/hooks/useAppContext'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'

function LiveCard({ stream, warning }: { stream: LiveStream; warning: boolean }) {
  const { t } = useTranslation()
  const profile = useProfile({ pubkey: stream.hostPubkey })
  const name = profile?.display_name || profile?.name || stream.hostPubkey.slice(0, 12)
  return (
    <Link
      to={`/live/${stream.naddr}`}
      className="group block min-w-0 rounded-xl p-2 hover:bg-accent/55 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
        {stream.image && !warning && (
          <img
            src={stream.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        )}
        {warning && (
          <span className="absolute inset-0 flex items-center justify-center text-sm">
            {t('live.contentWarning', 'Content warning')}
          </span>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground">
          <Radio className="h-3 w-3" aria-hidden="true" />
          {t('live.badge', 'LIVE')}
        </span>
        {stream.participants !== undefined && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-xs text-white">
            <Users className="h-3 w-3" aria-hidden="true" />
            {stream.participants.toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex gap-3 pt-3">
        <UserAvatar
          pubkey={stream.hostPubkey}
          picture={profile?.picture}
          name={name}
          className="h-9 w-9 shrink-0"
        />
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-sm font-semibold wrap-anywhere">{stream.title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{name}</p>
        </div>
      </div>
    </Link>
  )
}

/** NIP-53 viewing spike: discovery only, no stream hosting or publishing. */
export function LivePage() {
  const { t } = useTranslation()
  const { streams, isLoading, error } = useLiveStreams()
  const { config } = useAppContext()
  const blocked = useReportedPubkeys()
  const { presetContent } = useSelectedPreset()
  useEffect(() => {
    document.title = pageTitle(t('live.title', 'Live'))
  }, [t])
  const visible = streams.filter(stream => {
    if (stream.status !== 'live' || !stream.streamingUrls.length) return false
    if (
      blocked?.[stream.hostPubkey] ||
      blocked?.[stream.authorPubkey] ||
      presetContent.blockedEvents.includes(stream.event.id)
    )
      return false
    const warning =
      stream.contentWarning ||
      ([stream.hostPubkey, stream.authorPubkey].some(key => presetContent.nsfwPubkeys.includes(key))
        ? 'NSFW'
        : undefined)
    return getVideoPlayback(warning, config.nsfwFilter) !== 'hidden'
  })
  return (
    <div className="mx-auto max-w-560 px-3 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 px-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('live.spike', 'Livestream viewing · Spike')}
          </p>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <Radio className="h-7 w-7 text-destructive" aria-hidden="true" />
            {t('live.now', 'Live now')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('live.intro', 'Streams from across Nostr. Watch together, without hosting here.')}
          </p>
        </div>
        <span className="text-sm text-muted-foreground">{t('live.readOnly', 'Read only')}</span>
      </header>
      {error && (
        <p role="status" className="mb-4 px-2 text-sm text-muted-foreground">
          {error}
        </p>
      )}
      {isLoading && visible.length === 0 && (
        <p role="status" className="p-8 text-center text-muted-foreground">
          {t('live.loading', 'Finding live streams…')}
        </p>
      )}
      {!isLoading && visible.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Radio className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">{t('live.empty', 'No live streams found')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              'live.emptyHint',
              'New streams appear here as their announcements arrive. You can also open a NIP-53 naddr link directly at /live/<naddr>.'
            )}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-2 gap-y-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map(stream => (
          <LiveCard
            key={stream.address}
            stream={stream}
            warning={
              config.nsfwFilter === 'warning' &&
              (!!stream.contentWarning ||
                [stream.hostPubkey, stream.authorPubkey].some(key =>
                  presetContent.nsfwPubkeys.includes(key)
                ))
            }
          />
        ))}
      </div>
    </div>
  )
}

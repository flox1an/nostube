import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { ArrowLeft, MessageSquare, PanelRightClose, Radio, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveStream } from '@nostube/core/live-stream'
import { getVideoPlayback } from '@nostube/core/content-safety'
import { pageTitle } from '@nostube/core/instance-config'
import { VideoPlayer } from '@nostube/widgets/player'
import { Button } from '@nostube/widgets/components/button'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { useLiveStreams } from '@/hooks/useLiveStreams'
import { useLiveChat } from '@/hooks/useLiveChat'
import { useAppContext } from '@/hooks/useAppContext'
import { useBlockedPubkeys, useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { ContentSafetyGate } from '@/components/ContentSafetyGate'
import { RichTextContent } from '@/components/RichTextContent'
import { LiveChat } from '@/components/live/LiveChat'
import { cn } from '@/lib/utils'

function decodeStream(value: string | undefined) {
  try {
    const decoded = nip19.decode(value ?? '')
    if (decoded.type !== 'naddr' || decoded.data.kind !== 30311) return undefined
    return decoded.data
  } catch {
    return undefined
  }
}

function StreamViewer({ stream, warning }: { stream: LiveStream; warning?: string }) {
  const { t } = useTranslation()
  const { events, isLoading, error } = useLiveChat(stream)
  const blocked = useReportedPubkeys()
  const profile = useProfile({ pubkey: stream.hostPubkey })
  const name = profile?.display_name || profile?.name || stream.hostPubkey.slice(0, 12)
  const [chatOpen, setChatOpen] = useState(true)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const urls = useMemo(
    () =>
      stream.status === 'ended'
        ? stream.recordingUrl
          ? [stream.recordingUrl]
          : []
        : stream.streamingUrls,
    [stream.status, stream.recordingUrl, stream.streamingUrls]
  )
  const playbackKey = urls.join('\n')
  const mime = urls[0]?.split('?')[0].endsWith('.mp4')
    ? 'video/mp4'
    : 'application/vnd.apple.mpegurl'
  const visibleEvents = useMemo(
    () => events.filter(event => !blocked?.[event.pubkey]),
    [events, blocked]
  )
  useEffect(() => {
    document.title = pageTitle(stream.title)
  }, [stream.title])
  useEffect(() => {
    setPlaybackFailed(false)
  }, [playbackKey])
  return (
    <div className="mx-auto max-w-560 px-3 py-3 sm:px-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button variant="ghost" asChild className="min-h-11">
          <Link to="/live">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('live.all', 'All live streams')}
          </Link>
        </Button>
        <Button
          ref={toggleRef}
          variant="outline"
          className="min-h-11"
          aria-controls="stream-chat"
          aria-expanded={chatOpen}
          onClick={() => setChatOpen(open => !open)}
        >
          {chatOpen ? (
            <PanelRightClose className="mr-2 h-4 w-4" />
          ) : (
            <MessageSquare className="mr-2 h-4 w-4" />
          )}
          {chatOpen ? t('live.hideChat', 'Hide chat') : t('live.showChat', 'Show chat')}
        </Button>
      </div>
      <div
        className={cn(
          'grid items-start gap-4',
          chatOpen && 'lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]'
        )}
      >
        <div className="min-w-0">
          <div className="overflow-hidden rounded-xl bg-black" data-live-player>
            {stream.status === 'planned' || !urls.length ? (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-white">
                <Radio className="h-9 w-9" />
                <h1 className="text-lg font-semibold">
                  {stream.status === 'planned'
                    ? t('live.planned', 'This stream has not started yet')
                    : t('live.ended', 'This stream has ended')}
                </h1>
                <p className="text-sm text-white/70">
                  {t('live.waitHint', 'Status updates arrive automatically from Nostr.')}
                </p>
              </div>
            ) : (
              <VideoPlayer
                urls={urls}
                textTracks={[]}
                mime={mime}
                poster={stream.image}
                autoPlay={false}
                loop={false}
                authorPubkey={stream.hostPubkey}
                title={stream.title}
                authorName={name}
                contentWarning={warning}
                showTimelineMarkers={false}
                className="aspect-video w-full"
                onAllSourcesFailed={() => setPlaybackFailed(true)}
              />
            )}
          </div>
          {playbackFailed && (
            <p role="alert" className="mt-3 rounded-lg border p-3 text-sm">
              {t(
                'live.playbackFailed',
                'The broadcaster’s stream is unavailable or blocks playback in this browser. Try reloading the page when the broadcast is back.'
              )}
            </p>
          )}
          <div className="space-y-4 px-1 py-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold',
                  stream.status === 'live'
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Radio className="h-3.5 w-3.5" />
                {stream.status === 'live'
                  ? t('live.badge', 'LIVE')
                  : stream.status === 'planned'
                    ? t('live.scheduled', 'Scheduled')
                    : t('live.offline', 'Ended')}
              </span>
              {stream.participants !== undefined && stream.status === 'live' && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {t('live.viewers', {
                    defaultValue: '{{count}} watching',
                    count: stream.participants,
                  })}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {t('live.readOnly', 'Read only')}
              </span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight wrap-anywhere sm:text-2xl">
              {stream.title}
            </h1>
            <Link
              to={`/p/${nip19.npubEncode(stream.hostPubkey)}`}
              className="inline-flex min-h-11 items-center gap-3 rounded-lg pr-3 hover:bg-accent"
            >
              <UserAvatar
                pubkey={stream.hostPubkey}
                picture={profile?.picture}
                name={name}
                className="h-10 w-10"
              />
              <span className="font-medium">{name}</span>
            </Link>
            {stream.summary && (
              <div className="max-w-prose rounded-xl bg-muted/40 p-4 text-sm leading-relaxed wrap-anywhere">
                <RichTextContent content={stream.summary} authorPubkey={stream.hostPubkey} />
              </div>
            )}
          </div>
        </div>
        <aside
          id="stream-chat"
          aria-label={t('live.chat', 'Live chat')}
          hidden={!chatOpen}
          className="h-[min(720px,calc(100dvh-10rem))] min-h-80 overflow-hidden rounded-xl border bg-card lg:sticky lg:top-20"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setChatOpen(false)
              toggleRef.current?.focus()
            }
          }}
        >
          <LiveChat stream={stream} events={visibleEvents} isLoading={isLoading} error={error} />
        </aside>
      </div>
    </div>
  )
}

/** Landscape-only viewing spike; no VOD comments, suggestions or outgoing Nostr events. */
export function LiveStreamPage() {
  const { t } = useTranslation()
  const { naddr } = useParams()
  const pointer = useMemo(() => decodeStream(naddr), [naddr])
  const { streams, isLoading, error } = useLiveStreams(pointer ?? { pubkey: '', identifier: '' })
  const { config } = useAppContext()
  const blocked = useBlockedPubkeys()
  const { presetContent } = useSelectedPreset()
  const stream = pointer
    ? streams.find(
        value => value.authorPubkey === pointer.pubkey && value.identifier === pointer.identifier
      )
    : undefined
  if (!pointer)
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold">{t('live.invalid', 'Invalid livestream link')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('live.invalidHint', 'Open a NIP-53 livestream address (naddr, kind 30311).')}
        </p>
        <Link to="/live" className="mt-4 inline-block underline">
          {t('live.all', 'All live streams')}
        </Link>
      </div>
    )
  if (!stream)
    return (
      <div role="status" className="p-12 text-center">
        <h1 className="text-xl font-semibold">
          {isLoading
            ? t('live.loadingStream', 'Loading livestream…')
            : t('live.notFound', 'Livestream not found')}
        </h1>
        {error && <p className="mt-2 text-sm text-muted-foreground">{error}</p>}
        <Link to="/live" className="mt-4 inline-block underline">
          {t('live.all', 'All live streams')}
        </Link>
      </div>
    )
  const warning =
    stream.contentWarning ||
    ([stream.hostPubkey, stream.authorPubkey].some(key => presetContent.nsfwPubkeys.includes(key))
      ? 'NSFW'
      : undefined)
  if (
    blocked[stream.authorPubkey] ||
    blocked[stream.hostPubkey] ||
    presetContent.blockedEvents.includes(stream.event.id) ||
    getVideoPlayback(warning, config.nsfwFilter) === 'hidden'
  )
    return <ContentSafetyGate state="hidden" />
  return (
    <StreamViewer
      key={stream.address}
      stream={stream}
      warning={config.nsfwFilter === 'warning' ? warning : undefined}
    />
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { kinds, nip19 } from 'nostr-tools'
import { Radio, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveStream } from '@nostube/core/live-stream'
import { pageTitle } from '@nostube/core/instance-config'
import { buildShareLinks } from '@nostube/core/share-links'
import { hasLightningAddress } from '@nostube/core/zap-utils'
import { VideoPlayer } from '@nostube/widgets/player'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import ShareButton from '@nostube/widgets/components/ShareButton'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { useLiveStream, useLiveStreamPlayback } from '@/hooks/useLiveStreams'
import { ContentSafetyGate } from '@/components/ContentSafetyGate'
import { RichTextContent } from '@/components/RichTextContent'
import { FollowButton } from '@/components/FollowButton'
import { ZapButton } from '@/components/ZapButton'
import { LiveChat } from '@/components/live/LiveChat'
import { LiveBadge } from '@/components/live/LiveBadge'

function decodeStream(value: string | undefined) {
  try {
    const decoded = nip19.decode(value ?? '')
    if (decoded.type !== 'naddr' || decoded.data.kind !== kinds.LiveEvent) return undefined
    return decoded.data
  } catch {
    return undefined
  }
}

function StreamViewer({
  stream,
  warning,
  chatOnly = false,
}: {
  stream: LiveStream
  warning?: string
  chatOnly?: boolean
}) {
  const { t } = useTranslation()
  const profile = useProfile({ pubkey: stream.hostPubkey })
  const name = profile?.display_name || profile?.name || stream.hostPubkey.slice(0, 12)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const shareUrl = `${window.location.origin}/live/${stream.naddr}`
  const shareLinks = useMemo(
    () => buildShareLinks(shareUrl, shareUrl, stream.title, stream.image ?? ''),
    [shareUrl, stream.title, stream.image]
  )
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
  useEffect(() => {
    document.title = pageTitle(stream.title)
  }, [stream.title])
  useEffect(() => {
    setPlaybackFailed(false)
  }, [playbackKey])
  if (chatOnly)
    return (
      <div className="h-dvh overflow-hidden px-3 pt-2">
        <LiveChat stream={stream} />
      </div>
    )
  return (
    <div className="mx-auto h-full min-h-0 max-w-560 px-3 pt-3 sm:px-4">
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-4" data-live-details>
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
                autoPlay
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
            <div className="flex items-start justify-between gap-4">
              <h1 className="min-w-0 text-xl font-semibold tracking-tight wrap-anywhere sm:text-2xl">
                {stream.title}
              </h1>
              <div className="flex shrink-0 items-center gap-3 pt-1 text-sm">
                {stream.status === 'live' ? (
                  <LiveBadge />
                ) : (
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                    {stream.status === 'planned'
                      ? t('live.scheduled', 'Scheduled')
                      : t('live.offline', 'Ended')}
                  </span>
                )}
                {stream.participants !== undefined && stream.status === 'live' && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {t('live.viewers', {
                      defaultValue: '{{count}} watching',
                      count: stream.participants,
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to={`/p/${nip19.npubEncode(stream.hostPubkey)}`}
                className="inline-flex min-h-11 min-w-0 items-center gap-3 rounded-lg pr-3 hover:bg-accent"
              >
                <UserAvatar
                  pubkey={stream.hostPubkey}
                  picture={profile?.picture}
                  name={name}
                  className="h-10 w-10"
                />
                <span className="truncate font-medium">{name}</span>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <FollowButton pubkey={stream.hostPubkey} className="h-11" />
                {hasLightningAddress(profile) && (
                  <ZapButton
                    eventId={stream.event.id}
                    kind={kinds.LiveEvent}
                    authorPubkey={stream.authorPubkey}
                    recipientPubkey={stream.hostPubkey}
                    identifier={stream.identifier}
                    layout="inline"
                    className="h-11"
                  />
                )}
                <ShareButton
                  shareOpen={shareOpen}
                  setShareOpen={setShareOpen}
                  shareUrl={shareUrl}
                  shareTitle={stream.title}
                  shareLinks={shareLinks}
                  className="h-11 w-11 px-0 bg-transparent hover:bg-accent hover:text-accent-foreground"
                />
              </div>
            </div>
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
          className="h-full min-h-0 min-w-0 overflow-hidden"
        >
          <LiveChat stream={stream} />
        </aside>
      </div>
    </div>
  )
}

/** Landscape livestream with independent media/chat scroll areas. */
export function LiveStreamPage({ chatOnly = false }: { chatOnly?: boolean }) {
  const { t } = useTranslation()
  const { naddr } = useParams()
  const pointer = useMemo(() => decodeStream(naddr), [naddr])
  const { stream, isLoading, error } = useLiveStream(pointer)
  const playback = useLiveStreamPlayback(false)
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
  const { playback: state, warning } = playback(stream)
  if (state === 'hidden') return <ContentSafetyGate state="hidden" />
  return (
    <StreamViewer
      key={stream.address}
      stream={stream}
      chatOnly={chatOnly}
      warning={state === 'warn' ? warning : undefined}
    />
  )
}

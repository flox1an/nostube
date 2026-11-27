import { useState } from 'react'
import type { LiveStream } from '@nostube/core/live-stream'
import type { EmbedParams } from './lib/url-params'
import type { Profile } from './lib/profile-fetcher'
import type { EmbedPlayback } from './EmbedApp'
import { VideoPlayer } from '@nostube/widgets/player/VideoPlayer'
import { TitleOverlay } from './components/TitleOverlay'
import { ContentWarning } from './components/ContentWarning'
import { ErrorMessage } from './components/ErrorMessage'

/** Embed of a NIP-53 live stream: the HLS player while live, the recording once ended. */
export function LiveEmbed({
  params,
  stream,
  playback,
  warning,
  profile,
}: {
  params: EmbedParams
  stream: LiveStream
  playback: EmbedPlayback
  warning?: string
  profile: Profile | null
}) {
  const [accepted, setAccepted] = useState(false)
  const [failed, setFailed] = useState(false)
  const watchUrl = `https://nostu.be/live/${stream.naddr}`
  const profileUrl = `https://nostu.be/p/${stream.hostPubkey}`
  const poster = stream.image ?? stream.thumb

  if (playback === 'hidden' || playback === 'unverified')
    return (
      <ContentWarning
        title={playback === 'hidden' ? 'Sensitive content' : "Couldn't verify this stream"}
        message={
          playback === 'hidden'
            ? 'This stream is marked as sensitive. It only plays for viewers who enabled sensitive content in their nostube settings.'
            : "The safety check couldn't be completed, so this stream won't play here."
        }
        color={params.accentColor}
        watchUrl={watchUrl}
        watchLabel="Open on nostube"
      />
    )
  if (playback === 'warn' && !accepted)
    return (
      <ContentWarning
        title="Content Warning"
        message={warning || 'This stream may contain sensitive content.'}
        onAccept={() => setAccepted(true)}
        color={params.accentColor}
        poster={poster}
      />
    )

  const urls =
    stream.status === 'live'
      ? stream.streamingUrls
      : stream.status === 'ended' && stream.recordingUrl
        ? [stream.recordingUrl]
        : []
  if (failed) return <ErrorMessage message="Stream unavailable" />

  return (
    <div
      className="relative h-full w-full bg-black"
      style={{ '--embed-accent': `#${params.accentColor}` } as React.CSSProperties}
    >
      {urls.length ? (
        <VideoPlayer
          urls={urls}
          textTracks={[]}
          mime={
            urls[0].split('?')[0].endsWith('.mp4') ? 'video/mp4' : 'application/vnd.apple.mpegurl'
          }
          isLive={stream.status === 'live'}
          poster={poster}
          posterFallbacks={stream.thumb ? [stream.thumb] : undefined}
          autoPlay={params.autoplay}
          muted={params.muted}
          controls={params.controls}
          loop={false}
          authorPubkey={stream.hostPubkey}
          className="h-full w-full"
          onAllSourcesFailed={() => setFailed(true)}
        />
      ) : (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cover bg-center p-6 text-center text-white"
          style={poster ? { backgroundImage: `url(${poster})` } : undefined}
        >
          <span className="rounded bg-black/75 px-4 py-2 text-base font-semibold">
            {stream.status === 'planned'
              ? // eslint-disable-next-line react-hooks/purity -- the label must reflect the current time at render
                stream.starts && stream.starts * 1000 > Date.now()
                ? `Starts ${new Date(stream.starts * 1000).toLocaleString()}`
                : 'This stream has not started yet'
              : 'This stream has ended'}
          </span>
        </a>
      )}
      {params.showTitle && (
        <TitleOverlay
          title={stream.title}
          author={profile}
          authorPubkey={stream.hostPubkey}
          visible
          watchUrl={watchUrl}
          profileUrl={profileUrl}
          onOpenVideo={() => document.querySelector('video')?.pause()}
        />
      )}
    </div>
  )
}

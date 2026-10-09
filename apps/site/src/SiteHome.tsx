import { useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { EventStoreProvider } from 'applesauce-react/providers'
import type { Relay } from '@nostube/core'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { NostubeHostProvider, useNostubeHostValue } from '@nostube/widgets/host'
import { VideoPlayer } from '@nostube/widgets/player'
import { TimelineProvider, type TimelineContextValue } from '@nostube/widgets/timeline'
import { VideoGrid } from '@nostube/widgets'
import { AgeConfirm } from './AgeConfirm'
import { useAgeGate, type AgeGate } from './use-age-gate'
import { useCreatorBlossomServers } from './use-creator-blossom-servers'
import { useCreatorProfile } from './use-creator-profile'
import { useCreatorVideos } from './use-creator-videos'
import { useVideoById } from './use-video-by-id'

export interface SiteHomeProps {
  client: NostubeClient
  config: InstanceConfig
}

/** The creator's homepage: profile header, the selected video, the video grid. */
export function SiteHome({ client, config }: SiteHomeProps) {
  const blossomServers = useCreatorBlossomServers(client, config)

  // Instance build: every lookup goes to the instance's relays (nostube-server ADR 0005).
  const hostConfig = useMemo(() => {
    const relays: Relay[] = config.interactionRelays.map(url => ({
      url,
      name: url.replace(/^wss?:\/\//, ''),
      tags: ['read', 'write'],
    }))
    return { relays, blossomServers: blossomServers ?? [], cachingServers: [] }
  }, [config.interactionRelays, blossomServers])
  const hostRelays = useMemo(
    () => ({
      read: config.interactionRelays,
      indexer: config.interactionRelays,
      metadata: config.interactionRelays,
      zap: config.interactionRelays,
    }),
    [config.interactionRelays]
  )
  const host = useNostubeHostValue(hostConfig, client.relayPool, hostRelays)

  // A site has no reports, mutes or preset: the timeline only needs the creator's Blossom servers.
  const timeline = useMemo<TimelineContextValue>(
    () => ({
      client,
      policy: { blossomServers: hostConfig.blossomServers, getAllMissingVideos: () => ({}) },
    }),
    [client, hostConfig.blossomServers]
  )

  return (
    <EventStoreProvider eventStore={client.eventStore}>
      <NostubeHostProvider value={host}>
        <TooltipProvider>
          <TimelineProvider value={timeline}>
            <Site client={client} config={config} />
          </TimelineProvider>
        </TooltipProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )
}

/** Links to a video page; `link` is the video's naddr/nevent. */
const videoPath = (video: VideoEvent) => `/v/${video.link}`

function Site({ client, config }: SiteHomeProps) {
  const profile = useCreatorProfile(client, config)
  const gate = useAgeGate()
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header>
        <Link to="/" className="flex items-center gap-4">
          {profile?.picture && (
            <img src={profile.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{profile?.name ?? config.title}</h1>
            {profile?.about && <p className="text-sm text-muted-foreground">{profile.about}</p>}
          </div>
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<VideoList config={config} gate={gate} />} />
        <Route
          path="/v/:id"
          element={<VideoPage config={config} gate={gate} authorName={profile?.name} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

/** The grid of the creator's videos; a locked video asks for 18+ before its page opens. */
function VideoList({ config, gate }: { config: InstanceConfig; gate: AgeGate }) {
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config)
  const [pending, setPending] = useState<VideoEvent | null>(null)
  const navigate = useNavigate()

  const select = (video: VideoEvent) => {
    if (gate.isLocked(video)) setPending(video)
    else navigate(videoPath(video))
  }
  const confirmAge = () => {
    gate.confirm()
    if (pending) navigate(videoPath(pending))
    setPending(null)
  }

  return (
    <>
      {pending && <AgeConfirm onConfirm={confirmAge} onCancel={() => setPending(null)} />}
      {error && <p className="text-red-600">Could not load videos.</p>}
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading videos…</p>
      ) : (
        <>
          <VideoGrid videos={videos} onSelect={select} isLocked={gate.isLocked} />
          {hasMore && (
            <div className="text-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

/** One video at its own URL (`/v/<naddr>`), so it can be shared and opened directly. */
function VideoPage({
  config,
  gate,
  authorName,
}: {
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
}) {
  const { id } = useParams()
  const lookup = useVideoById(id, config)
  const navigate = useNavigate()

  const back = (
    <Link to="/" className="text-sm text-muted-foreground hover:underline">
      ← All videos
    </Link>
  )

  if (lookup.status === 'invalid') {
    return (
      <div className="space-y-2">
        {back}
        <p className="py-12 text-center text-muted-foreground">This video link is not valid.</p>
      </div>
    )
  }
  if (lookup.status === 'loading') {
    return (
      <div className="space-y-2">
        {back}
        <p className="py-12 text-center text-muted-foreground">Loading video…</p>
      </div>
    )
  }
  if (lookup.status === 'not-found') {
    return (
      <div className="space-y-2">
        {back}
        <p className="py-12 text-center text-muted-foreground">Video not found.</p>
      </div>
    )
  }

  const selected = lookup.video
  return (
    <div className="space-y-4">
      {back}
      {gate.isLocked(selected) ? (
        <AgeConfirm onConfirm={gate.confirm} onCancel={() => navigate('/')} />
      ) : (
        <section className="space-y-2">
          <VideoPlayer
            key={selected.id}
            urls={selected.urls}
            textTracks={selected.textTracks}
            mime={selected.mimeType ?? ''}
            mediaType={selected.mediaType}
            poster={selected.images[0] ?? ''}
            posterHash={selected.thumbnailVariants[0]?.hash}
            sha256={selected.x}
            authorPubkey={selected.pubkey}
            eventId={selected.id}
            videoVariants={selected.videoVariants}
            contentWarning={gate.warningFor(selected)}
            title={selected.title}
            authorName={authorName}
          />
          <h2 className="text-lg font-medium">{selected.title}</h2>
          {selected.description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {selected.description}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

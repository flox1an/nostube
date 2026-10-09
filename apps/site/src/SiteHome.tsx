import { useMemo, useState } from 'react'
import { EventStoreProvider } from 'applesauce-react/providers'
import type { Relay } from '@nostube/core'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { NostubeHostProvider, useNostubeHostValue } from '@nostube/widgets/host'
import { VideoPlayer } from '@nostube/widgets/player'
import { VideoGrid } from '@nostube/widgets'
import { useCreatorBlossomServers } from './use-creator-blossom-servers'
import { useCreatorProfile } from './use-creator-profile'
import { useCreatorVideos } from './use-creator-videos'

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

  return (
    <EventStoreProvider eventStore={client.eventStore}>
      <NostubeHostProvider value={host}>
        <TooltipProvider>
          <Homepage client={client} config={config} />
        </TooltipProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )
}

function Homepage({ client, config }: SiteHomeProps) {
  const profile = useCreatorProfile(client, config)
  const { videos, loading, error } = useCreatorVideos(client, config)
  const [selected, setSelected] = useState<VideoEvent | null>(null)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex items-center gap-4">
        {profile?.picture && (
          <img src={profile.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{profile?.name ?? config.title}</h1>
          {profile?.about && <p className="text-sm text-muted-foreground">{profile.about}</p>}
        </div>
      </header>

      {selected && (
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
            title={selected.title}
            authorName={profile?.name}
          />
          <h2 className="text-lg font-medium">{selected.title}</h2>
          {selected.description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {selected.description}
            </p>
          )}
        </section>
      )}

      {error && <p className="text-red-600">Could not load videos: {error}</p>}
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading videos…</p>
      ) : (
        <VideoGrid videos={videos} onSelect={setSelected} />
      )}
    </div>
  )
}

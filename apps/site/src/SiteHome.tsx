import { useMemo } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { EventStoreProvider } from 'applesauce-react/providers'
import type { Relay } from '@nostube/core'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { NostubeHostProvider, useNostubeHostValue } from '@nostube/widgets/host'
import { TimelineProvider, type TimelineContextValue } from '@nostube/widgets/timeline'
import { GridPage } from './GridPage'
import { VideoView } from './VideoView'
import { useAgeGate } from './use-age-gate'
import { useCreatorBlossomServers } from './use-creator-blossom-servers'
import { useCreatorProfile } from './use-creator-profile'

export interface SiteHomeProps {
  client: NostubeClient
  config: InstanceConfig
}

/** The creator's site: the header, then the video grid or one video, each at its own URL. */
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
            <h1 className="text-2xl font-semibold">{config.title}</h1>
            {config.site.tagline && (
              <p className="text-sm text-muted-foreground">{config.site.tagline}</p>
            )}
          </div>
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<GridPage config={config} gate={gate} />} />
        <Route
          path="/v/:id"
          element={<VideoView config={config} gate={gate} authorName={profile?.name} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

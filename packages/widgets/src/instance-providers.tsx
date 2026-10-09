import { useMemo, type ReactNode } from 'react'
import { EventStoreProvider } from 'applesauce-react/providers'
import type { Relay } from '@nostube/core'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { TooltipProvider } from './components/tooltip'
import { useCreatorBlossomServers } from './hooks/useCreatorBlossomServers'
import { NostubeHostProvider, useNostubeHostValue } from './host'
import { TimelineProvider, type TimelineContextValue } from './timeline'

/**
 * Everything the shared widgets and hooks need around an instance: the event store, the host
 * (every lookup goes to the instance's relays, nostube-server ADR 0005), the tooltip provider and
 * the timeline. A page of an instance (the site, the studio) wraps its tree in this once.
 */
export function InstanceProviders({
  client,
  config,
  children,
}: {
  client: NostubeClient
  config: InstanceConfig
  children: ReactNode
}) {
  const blossomServers = useCreatorBlossomServers(client, config)

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

  // An instance has no reports, mutes or preset: the timeline only needs the creator's Blossom servers.
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
          <TimelineProvider value={timeline}>{children}</TimelineProvider>
        </TooltipProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )
}

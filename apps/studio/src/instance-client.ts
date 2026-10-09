import { createNostubeClient, type NostubeClient } from '@nostube/core/client'
import { loadInstanceConfig, type InstanceConfig } from '@nostube/core/instance-config'

export interface InstanceClient {
  config: InstanceConfig
  client: NostubeClient
}

let booted: Promise<InstanceClient> | undefined

/**
 * The public config of the running instance and one Nostr client for it, created on first use
 * (the picker for hidden videos). One client for the whole page: the config is registered once.
 */
export function bootInstanceClient(): Promise<InstanceClient> {
  booted ??= loadInstanceConfig().then(config => ({
    config,
    client: createNostubeClient({
      defaultRelays: config.interactionRelays,
      instance: config,
      debug: import.meta.env.DEV,
    }),
  }))
  // A failed boot may be retried by reloading; do not cache the failure.
  booted.catch(() => {
    booted = undefined
  })
  return booted
}

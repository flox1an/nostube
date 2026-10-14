import { NostrConnectSigner } from 'applesauce-signers'
import { createNostubeClient, type NostubeClient } from '@nostube/core/client'
import { loadInstanceConfig, type InstanceConfig } from '@nostube/core/instance-config'

export interface InstanceClient {
  config: InstanceConfig
  client: NostubeClient
}

let booted: Promise<InstanceClient> | undefined

/**
 * The public config of the running instance and one Nostr client for it, created on first use
 * (the picker for hidden videos, the Nostr accounts). One client for the whole page: the config is
 * registered once.
 */
export function bootInstanceClient(): Promise<InstanceClient> {
  booted ??= loadInstanceConfig().then(config => {
    const client = createNostubeClient({
      defaultRelays: config.interactionRelays,
      instance: config,
      debug: import.meta.env.DEV,
    })
    // NIP-46 transport for bunker and Nostr Connect accounts (the site does the same).
    NostrConnectSigner.subscriptionMethod = client.subscriptionMethod
    NostrConnectSigner.publishMethod = client.publishMethod
    return { config, client }
  })
  // A failed boot may be retried by reloading; do not cache the failure.
  booted.catch(() => {
    booted = undefined
  })
  return booted
}

import { NostrConnectSigner } from 'applesauce-signers'
import { createNostubeClient, type PageLoader } from '@nostube/core/client'
import { getInstanceConfig } from '@nostube/core/instance-config'
import { presetRelays } from '@/constants/relays'
import { lastLoadedTimestamp } from '@nostube/core/video-timeline-cache'

export type { PageLoader }

const instance = getInstanceConfig()

// Default relays for video content - these will be overridden by user config.
// Instance build: the interaction relays (publish fallback, lookups, wallet, DVM).
export const DEFAULT_RELAYS = instance ? instance.interactionRelays : presetRelays.map(r => r.url)

export const client = createNostubeClient({
  defaultRelays: DEFAULT_RELAYS,
  instance,
  debug: import.meta.env.DEV,
})

export const { eventStore, relayPool, cacheEvents, cacheRequest, getTimelineLoader } = client
export const { subscriptionMethod, publishMethod } = client

// Required for NIP-46 bunker:// login; also used by applesauce-wallet-connect.
NostrConnectSigner.subscriptionMethod = subscriptionMethod
NostrConnectSigner.publishMethod = publishMethod

export function resetNostrRuntimeCache() {
  client.reset()
  lastLoadedTimestamp.clear()
}

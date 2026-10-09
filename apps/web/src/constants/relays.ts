import {
  type Relay,
  type BlossomServer,
  type BlossomServerTag,
  type CachingServer,
} from '@nostube/core'
import {
  DEFAULT_MIRROR_SERVERS,
  DEFAULT_UPLOAD_SERVERS,
  deriveServerName,
} from '@/lib/blossom-servers'

import { getInstanceConfig } from '@nostube/core/instance-config'

// Re-export from unified blossom-url module for backwards compatibility
export { BLOCKED_BLOSSOM_SERVERS, isBlossomServerBlocked } from '@nostube/core/blossom-url'

// Instance build: no public relay is ever added; the interaction relays replace the
// profile/indexer/zap relays (nostube-server ADR 0005). Null in the nostu.be build.
const instance = getInstanceConfig()

export const presetRelays: Relay[] = instance
  ? []
  : [
      { url: 'wss://relay.nostu.be', name: 'relay.nostu.be', tags: ['read'] },
      { url: 'wss://relay.divine.video', name: 'relay.divine.video', tags: ['read'] },
      { url: 'wss://relay.primal.net', name: 'relay.primal.net', tags: ['read'] },
      { url: 'wss://nos.lol', name: 'nos.lol', tags: ['read'] },
      { url: 'wss://offchain.pub', name: 'offchain.pub', tags: ['read'] },
      { url: 'wss://nostr.wine', name: 'nostr.wine', tags: ['read'] },
    ]

/**
 * Default relays for profile metadata, follow lists, and blossom servers.
 * purplepag.es is a specialized relay that focuses on profile data.
 */
export const METADATA_RELAYS: string[] = instance
  ? instance.interactionRelays
  : ['wss://purplepag.es']

/**
 * Indexer relays for discovering NIP-65 relay lists and profile metadata.
 * These aggregate data from many relays and are useful for discovery when
 * the user has no configured relays (e.g., incognito mode).
 */
export const INDEXER_RELAYS: string[] = instance
  ? instance.interactionRelays
  : [
      'wss://index.hzrd149.com', // Relay indexer
      'wss://relay.noswhere.com', // Popular relay with good coverage
      'wss://relay.snort.social', // Snort relay
    ]

/**
 * Well-known relays that reliably store zap receipts (kind 9735).
 * Used as fallback when the user has no read relays configured,
 * and as supplement to ensure zap events are found.
 */
export const ZAP_RELAYS: string[] = instance
  ? instance.interactionRelays
  : ['wss://relay.primal.net', 'wss://nos.lol']

/**
 * Default relays for publishing kind 22236 view-tracking events.
 * Users can override this in Settings → Network → View Tracking.
 */
export const DEFAULT_VIEW_TRACKING_RELAYS: string[] = instance ? [] : ['wss://relay.divine.video']

export const presetBlossomServers: BlossomServer[] = [
  ...DEFAULT_UPLOAD_SERVERS.map(url => ({
    url,
    name: deriveServerName(url),
    tags: ['initial upload' as BlossomServerTag],
  })),
  ...DEFAULT_MIRROR_SERVERS.map(url => ({
    url,
    name: deriveServerName(url),
    tags: ['mirror' as BlossomServerTag],
  })),
]

export const presetCachingServers: CachingServer[] = []

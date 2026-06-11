import {
  type Relay,
  type BlossomServer,
  type BlossomServerTag,
  type CachingServer,
} from '@/contexts/AppContext'
import {
  DEFAULT_MIRROR_SERVERS,
  DEFAULT_UPLOAD_SERVERS,
  deriveServerName,
} from '@/lib/blossom-servers'

// Re-export from unified blossom-url module for backwards compatibility
export { BLOCKED_BLOSSOM_SERVERS, isBlossomServerBlocked } from '@/lib/blossom-url'

export const presetRelays: Relay[] = [
  { url: 'wss://relay.divine.video', name: 'relay.divine.video', tags: ['read'] },
  { url: 'wss://relay.damus.io', name: 'relay.damus.io', tags: ['read'] },
  { url: 'wss://relay.primal.net', name: 'relay.primal.net', tags: ['read'] },
  { url: 'wss://nos.lol', name: 'nos.lol', tags: ['read'] },
]

/**
 * Default relay for profile metadata, follow lists, and blossom servers.
 * purplepag.es is a specialized relay that focuses on profile data.
 */
export const METADATA_RELAY = 'wss://purplepag.es'

/**
 * Indexer relays for discovering NIP-65 relay lists and profile metadata.
 * These aggregate data from many relays and are useful for discovery when
 * the user has no configured relays (e.g., incognito mode).
 */
export const INDEXER_RELAYS: string[] = [
  'wss://index.hzrd149.com', // Relay indexer
  'wss://relay.noswhere.com', // Popular relay with good coverage
  'wss://relay.snort.social', // Snort relay
]

/**
 * Well-known relays that reliably store zap receipts (kind 9735).
 * Used as fallback when the user has no read relays configured,
 * and as supplement to ensure zap events are found.
 */
export const ZAP_RELAYS: string[] = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

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

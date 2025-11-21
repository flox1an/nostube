import { type Relay, type BlossomServer, type CachingServer } from '@/contexts/AppContext'

export const presetRelays: Relay[] = [
  { url: 'wss://relay.divine.video', name: 'relay.divine.video', tags: ['read'] },
  { url: 'wss://ditto.pub/relay', name: 'ditto.pub', tags: ['read'] },
  { url: 'wss://relay.nostr.band', name: 'relay.nostr.band', tags: ['read'] },
  { url: 'wss://relay.damus.io', name: 'relay.damus.io', tags: ['read'] },
  { url: 'wss://relay.primal.net', name: 'relay.primal.net', tags: ['read'] },
  { url: 'wss://nos.lol', name: 'nos.lol', tags: ['read'] },
]

/**
 * Default relay for profile metadata, follow lists, and blossom servers.
 * purplepag.es is a specialized relay that focuses on profile data.
 */
export const METADATA_RELAY = 'wss://purplepag.es'

export const presetBlossomServers: BlossomServer[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'almond.slidestr.net',
    tags: ['initial upload'],
  },
]

export const presetCachingServers: CachingServer[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'almond.slidestr.net',
  },
]

/**
 * Blossom servers that should be blocked/filtered out.
 * These servers re-encode videos and serve low-quality content.
 */
export const BLOCKED_BLOSSOM_SERVERS = ['cdn.nostrcheck.me']

/**
 * Check if a blossom server URL should be blocked.
 * @param url - The server URL to check (with or without protocol)
 * @returns true if the server should be blocked
 */
export function isBlossomServerBlocked(url: string): boolean {
  const normalizedUrl = url.toLowerCase()
  return BLOCKED_BLOSSOM_SERVERS.some(blocked => normalizedUrl.includes(blocked.toLowerCase()))
}

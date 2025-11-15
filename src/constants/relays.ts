import { type Relay, type BlossomServer } from '@/contexts/AppContext'

export const presetRelays: Relay[] = [
  { url: 'wss://relay.divine.video', name: 'Divine Video', tags: ['read'] },
  { url: 'wss://ditto.pub/relay', name: 'Ditto', tags: ['read'] },
  { url: 'wss://relay.nostr.band', name: 'Nostr.Band', tags: ['read'] },
  { url: 'wss://relay.damus.io', name: 'Damus', tags: ['read'] },
  { url: 'wss://relay.primal.net', name: 'Primal', tags: ['read'] },
  { url: 'wss://nos.lol/', name: 'nos.lol', tags: ['read'] },
]

/**
 * Default relay for profile metadata, follow lists, and blossom servers.
 * purplepag.es is a specialized relay that focuses on profile data.
 */
export const METADATA_RELAY = 'wss://purplepag.es'

export const presetBlossomServers: BlossomServer[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'Almond Slidestr',
    tags: ['proxy', 'initial upload'],
  },
]

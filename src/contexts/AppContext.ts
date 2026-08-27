import { type RelayPool } from 'applesauce-relay'
import { createContext } from 'react'

export type Theme = 'dark' | 'light' | 'system'
export type VideoType = 'all' | 'shorts' | 'videos'
export type BlossomServerTag = 'mirror' | 'initial upload'
export type RelayTag = 'read' | 'write'
export type NsfwFilter = 'hide' | 'warning' | 'show'
export type PreferredQuality = 'highest' | '720p'

export interface Relay {
  url: string
  name: string
  tags: RelayTag[]
}

export interface BlossomServer {
  url: string
  name: string
  tags: BlossomServerTag[]
}

export interface CachingServer {
  url: string
  name: string
}

export interface MediaConfig {
  failover: {
    enabled: boolean
    discovery: {
      enabled: boolean // Search relays for alternatives
      timeout: number // Discovery timeout (ms)
      maxResults: number // Limit discovered URLs
    }
    validation: {
      enabled: boolean // Pre-validate URLs
      timeout: number // HEAD request timeout
      parallelRequests: number // Max parallel validations
    }
  }
  proxy: {
    enabled: boolean
    includeOrigin: boolean // Add origin param
    imageSizes: { width: number; height: number }[] // Responsive sizes
  }
}

export interface AppConfig {
  /** Current theme */
  theme: Theme
  /** Selected relays */
  relays: Relay[]
  /** Selected video type */
  videoType: VideoType
  /** Blossom servers for file uploads */
  blossomServers?: BlossomServer[]
  /** Media caching servers for proxying/caching video content */
  cachingServers?: CachingServer[]
  /** NSFW content filter setting */
  nsfwFilter: NsfwFilter
  /** Show videos whose playable media URL points to YouTube */
  showYouTubeContent?: boolean
  /** Show audio-only content such as podcast episodes */
  showAudioContent?: boolean
  /** Media failover configuration */
  media?: MediaConfig
  /** Selected preset pubkey (null = use default preset) */
  selectedPresetPubkey?: string | null
  /** Preferred default video quality: 'highest' selects best available, '720p' selects mid quality */
  preferredQuality?: PreferredQuality
  /** Event IDs the user has reported (hidden from feeds) */
  reportedEventIds?: string[]
  /** External search service base URL (overrides built-in default) */
  searchServiceUrl?: string
  /** Image proxy base URL for fixed thumbnail presets, stored only in this browser. */
  imgproxyBaseUrl?: string
  /** Publish view-tracking events (kind 22236) to these relays. */
  viewTrackingRelays?: string[]
  /** When false, no view events are enqueued or published. Default true. */
  viewTrackingEnabled?: boolean
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: AppConfig) => AppConfig) => void
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: Relay[]
  /** Is the sidebar currently open */
  isSidebarOpen: boolean
  /** Toggle the sidebar open/close state */
  toggleSidebar: () => void
  /** Relay override for filtering feeds (null = global/all read relays) */
  relayOverride: string | null
  /** Set the relay override */
  setRelayOverride: (relay: string | null) => void

  pool: RelayPool
}

export const AppContext = createContext<AppContextType | undefined>(undefined)

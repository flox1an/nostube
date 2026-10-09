import { type PresetModerationEntry } from './preset'

export type Theme = 'dark' | 'light' | 'system'
export type VideoType = 'all' | 'shorts' | 'videos'
export type BlossomServerTag = 'mirror' | 'initial upload'
export type RelayTag = 'read' | 'write'
export type NsfwFilter = 'hide' | 'warning' | 'show'
export type PreferredQuality = 'highest' | '720p'

/** localStorage key of the persisted AppConfig (also read by the embed player). */
export const APP_CONFIG_STORAGE_KEY = 'nostr:app-config'

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
  /** NSFW content filter setting. Read the effective value from context; see getEffectiveNsfwFilter. */
  nsfwFilter: NsfwFilter
  /** Set once the viewer confirmed being 18+ when opting in to NSFW content. */
  nsfwAgeConfirmed?: boolean
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
  /** Staged admin moderation entries awaiting bulk-apply in /admin */
  presetModerationBuffer?: PresetModerationEntry[]
  /** External search service base URL (overrides built-in default) */
  searchServiceUrl?: string
  /** Image proxy base URL for fixed thumbnail presets, stored only in this browser. */
  imgproxyBaseUrl?: string
  /** Publish view-tracking events (kind 22236) to these relays. */
  viewTrackingRelays?: string[]
  /** When false, no view events are enqueued or published. Default true. */
  viewTrackingEnabled?: boolean
}

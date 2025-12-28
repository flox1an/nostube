import { type RelayPool } from 'applesauce-relay'
import { createContext } from 'react'

export type Theme = 'dark' | 'light' | 'system'
export type VideoType = 'all' | 'shorts' | 'videos'
export type BlossomServerTag = 'mirror' | 'initial upload'
export type RelayTag = 'read' | 'write'
export type NsfwFilter = 'hide' | 'warning' | 'show'

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
  /** Thumbnail resize server URL (optional) */
  thumbResizeServerUrl?: string
  /** NSFW content filter setting */
  nsfwFilter: NsfwFilter
  /** Media failover configuration */
  media?: MediaConfig
  /** Selected preset pubkey (null = use default preset) */
  selectedPresetPubkey?: string | null
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

  pool: RelayPool
}

export const AppContext = createContext<AppContextType | undefined>(undefined)

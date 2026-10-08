import { type RelayPool } from 'applesauce-relay'
import { createContext } from 'react'
import { type AppConfig, type Relay } from '@nostube/core'

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

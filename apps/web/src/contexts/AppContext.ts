import { type RelayPool } from 'applesauce-relay'
import { createContext } from 'react'
import { type AppConfig, type Relay } from '@nostube/core'

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: AppConfig) => AppConfig) => void
  /** Optional preset relay metadata. */
  presetRelays?: Relay[]
  /** Is the sidebar currently open */
  isSidebarOpen: boolean
  /** Toggle the sidebar open/close state */
  toggleSidebar: () => void

  pool: RelayPool
}

export const AppContext = createContext<AppContextType | undefined>(undefined)

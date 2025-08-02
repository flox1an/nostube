import { RelayPool } from 'applesauce-relay';
import { createContext } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type VideoType = 'all' | 'shorts' | 'videos';
export type BlossomServerTag = 'mirror' | 'initial upload';
export type RelayTag = 'read' | 'write';

export interface Relay {
  url: string;
  name: string;
  tags: RelayTag[];
}

export interface BlossomServer {
  url: string;
  name: string;
  tags: BlossomServerTag[];
}

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** Selected relays */
  relays: Relay[];
  /** Selected video type */
  videoType: VideoType;
  /** Blossom servers for file uploads */
  blossomServers?: BlossomServer[];
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: AppConfig) => AppConfig) => void;
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: Relay[];
  /** Is the sidebar currently open */
  isSidebarOpen: boolean;
  /** Toggle the sidebar open/close state */
  toggleSidebar: () => void;

  pool: RelayPool;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

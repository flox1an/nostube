import { createContext } from "react";

export type Theme = "dark" | "light" | "system";
export type VideoType = "all" | "shorts" | "videos";

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** Selected relay URL */
  relays: string[];
  /** Selected video type */
  videoType: VideoType;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: AppConfig) => AppConfig) => void;
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: { name: string; url: string }[];
  /** Is the sidebar currently open */
  isSidebarOpen: boolean;
  /** Toggle the sidebar open/close state */
  toggleSidebar: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

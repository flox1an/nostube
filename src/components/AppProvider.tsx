import { ReactNode, useState, useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType } from '@/contexts/AppContext';
import { useFollowedAuthors } from '@/hooks/useFollowedAuthors';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: { name: string; url: string }[];
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
    presetRelays,
  } = props;

  // App configuration state with localStorage persistence
  const [config, setConfig] = useLocalStorage<AppConfig>(storageKey, defaultConfig);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: followedPubkeys = [] } = useFollowedAuthors();

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: AppConfig) => AppConfig) => {
    setConfig(updater);
  };

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const appContextValue: AppContextType = {
    config,
    updateConfig,
    presetRelays,
    isSidebarOpen,
    toggleSidebar,
    followedPubkeys,
  };

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

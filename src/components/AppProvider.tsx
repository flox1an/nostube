import { ReactNode, useState, useCallback, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType } from '@/contexts/AppContext';
import { useUserRelays } from '@/hooks/useUserRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatBlobUrl, mergeRelays } from '@/lib/utils';

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
  const { children, storageKey, defaultConfig, presetRelays } = props;

  // App configuration state with localStorage persistence
  const [config, setConfig] = useLocalStorage<AppConfig>(storageKey, defaultConfig);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { user } = useCurrentUser();
  const userRelays = useUserRelays(user?.pubkey);

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: AppConfig) => AppConfig) => {
    setConfig(updater);
  };

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => {
      const newState = !prev;
      if (newState) {
        window.scrollTo(0, 0);
      }
      return newState;
    });
  }, []);

  useEffect(() => {
    if ((config.relays || []).length == 0 && !userRelays.isLoading && userRelays.data && userRelays.data.length > 0) {
      console.log([config.relays || [], userRelays.data.map(r => r.url)]);
      setConfig({
        ...config,
        relays: mergeRelays([config.relays || [], userRelays.data.map(r => r.url)]),
      });
    }
  }, [userRelays.data]);

  // MIGRATION: convert string[] blossomServers to BlossomServer[]
  useEffect(() => {
    if (
      Array.isArray(config.blossomServers) &&
      config.blossomServers.length > 0 &&
      typeof config.blossomServers[0] === 'string'
    ) {
      setConfig({
        ...config,
        blossomServers: (config.blossomServers as unknown as string[]).map(url => ({
          url,
          tags: [],
          name: formatBlobUrl(url),
        })),
      });
    }
  }, [config.blossomServers]);

  const appContextValue: AppContextType = {
    config,
    updateConfig,
    presetRelays,
    isSidebarOpen,
    toggleSidebar,
  };

  return <AppContext.Provider value={appContextValue}>{children}</AppContext.Provider>;
}

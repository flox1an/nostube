import { type ReactNode, useState, useCallback, useEffect } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import {
  AppContext,
  type Relay,
  type AppConfig,
  type AppContextType,
  type BlossomServerTag,
} from '@/contexts/AppContext'
import { relayPool } from '@/nostr/core'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUserBlossomServers } from '@/hooks/useUserBlossomServers'

interface AppProviderProps {
  children: ReactNode
  /** Application storage key */
  storageKey: string
  /** Default app configuration */
  defaultConfig: AppConfig
  /** Optional list of preset relays to display in the RelaySelector */
  presetRelays?: Relay[]
}

export function AppProvider(props: AppProviderProps) {
  const { children, storageKey, defaultConfig, presetRelays } = props

  // App configuration state with localStorage persistence
  const [config, setConfig] = useLocalStorage<AppConfig>(storageKey, defaultConfig)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const { user } = useCurrentUser()
  const userBlossomServers = useUserBlossomServers()

  // Configure relayPool when relays change
  useEffect(() => {
    // RelayPool doesn't have a clear method, just reconfigure the group
    relayPool.group(config.relays.map(r => r.url))
  }, [config.relays])

  // Auto-load user's NIP-63 (kind 10063) blossom servers
  useEffect(() => {
    // Only proceed if user is logged in and has blossom servers
    if (!user?.pubkey || !userBlossomServers.data?.length) {
      return
    }

    // Get current servers from config
    const currentServers = config.blossomServers || []
    const currentUrls = new Set(currentServers.map(s => s.url))

    // Find new servers (not already in config)
    const newServers = userBlossomServers.data
      .filter(url => !currentUrls.has(url))
      .map(url => ({
        url,
        name: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        tags: [] as BlossomServerTag[], // Empty tags for user's 10063 servers
      }))

    // Only update if there are new servers to add
    if (newServers.length > 0) {
      setConfig(currentConfig => ({
        ...currentConfig,
        blossomServers: [...(currentConfig.blossomServers || []), ...newServers],
      }))
    }
  }, [user?.pubkey, userBlossomServers.data, setConfig])

  //const { user } = useCurrentUser();
  // const userRelays = useUserRelays(user?.pubkey);

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: AppConfig) => AppConfig) => {
    setConfig(updater)
  }

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => {
      const newState = !prev
      if (newState) {
        window.scrollTo(0, 0)
      }
      return newState
    })
  }, [])

  /*
  useEffect(() => {
    if ((config.relays || []).length == 0 && !userRelays.isLoading && userRelays.data && userRelays.data.length > 0) {
      console.log([config.relays || [], userRelays.data.map(r => r.url)]);
      setConfig({
        ...config,
        relays: [
          ...(config.relays || []),
          ...userRelays.data.map(r => ({ url: r.url, name: r.url, tags: ['read'] }) as Relay),
        ],
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

  // MIGRATION: add tags to relays
  useEffect(() => {
    if (Array.isArray(config.relays) && config.relays.length > 0) {
      const tagsMissing = config.relays.filter(r => r.tags == undefined).length;
      if (tagsMissing) {
        // Add tags where missing
        setConfig({ ...config, relays: config.relays.map(r => ({ ...r, tags: r.tags || [] })) });
      }
    }
  }, [config.relays]);
*/
  const appContextValue: AppContextType = {
    config,
    updateConfig,
    presetRelays,
    isSidebarOpen,
    toggleSidebar,
    pool: relayPool,
  }

  return <AppContext.Provider value={appContextValue}>{children}</AppContext.Provider>
}

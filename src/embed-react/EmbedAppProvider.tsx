import { useMemo } from 'react'
import {
  AppContext,
  type AppContextType,
  type AppConfig,
  type BlossomServerTag,
} from '@/contexts/AppContext'
import { RelayPool } from 'applesauce-relay'

interface EmbedAppProviderProps {
  children: React.ReactNode
  /** Author's blossom server URLs for fallback URL generation */
  authorBlossomServers?: string[]
}

/**
 * Minimal AppContext provider for the embed player.
 * Provides author's blossom servers for fallback URL generation without
 * requiring the full app context.
 */
export function EmbedAppProvider({ children, authorBlossomServers = [] }: EmbedAppProviderProps) {
  const contextValue = useMemo<AppContextType>(() => {
    // Convert author's blossom server URLs to the format expected by AppContext
    const blossomServers = authorBlossomServers.map(url => ({
      url,
      name: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      tags: ['mirror'] as BlossomServerTag[],
    }))

    const config: AppConfig = {
      theme: 'dark',
      relays: [],
      videoType: 'all',
      blossomServers,
      cachingServers: [],
      nsfwFilter: 'warning',
      media: {
        failover: {
          enabled: true,
          discovery: {
            enabled: true,
            timeout: 10000,
            maxResults: 20,
          },
          validation: {
            enabled: false,
            timeout: 5000,
            parallelRequests: 3,
          },
        },
        proxy: {
          enabled: false,
          includeOrigin: false,
          imageSizes: [],
        },
      },
    }

    return {
      config,
      updateConfig: () => {}, // No-op for embed
      isSidebarOpen: false,
      toggleSidebar: () => {}, // No-op for embed
      pool: new RelayPool(),
    }
  }, [authorBlossomServers])

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
}

import { useMemo } from 'react'
import {
  AppContext,
  type AppContextType,
  type AppConfig,
  type BlossomServerTag,
} from '@/contexts/AppContext'
import { RelayPool } from 'applesauce-relay'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react/providers'

interface EmbedAppProviderProps {
  children: React.ReactNode
  /** Author's blossom server URLs for fallback URL generation */
  authorBlossomServers?: string[]
}

// Create singleton EventStore and RelayPool for the embed
// These are created outside the component to persist across re-renders
const embedEventStore = new EventStore()
const embedRelayPool = new RelayPool()

/**
 * Minimal AppContext provider for the embed player.
 * Provides author's blossom servers for fallback URL generation,
 * EventStore for zap timeline markers, and RelayPool for relay subscriptions.
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
      relayOverride: null,
      setRelayOverride: () => {}, // No-op for embed
      pool: embedRelayPool,
    }
  }, [authorBlossomServers])

  return (
    <EventStoreProvider eventStore={embedEventStore}>
      <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
    </EventStoreProvider>
  )
}

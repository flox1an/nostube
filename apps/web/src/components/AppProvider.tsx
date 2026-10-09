import { type ReactNode, useState, useCallback, useEffect, useMemo } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { type Relay, type RelayTag, type AppConfig } from '@nostube/core'
import { NostubeHostBridge } from '@/components/NostubeHostBridge'
import { AppContext, type AppContextType } from '@/contexts/AppContext'
import { relayPool } from '@/nostr/core'
import { getEffectiveNsfwFilter } from '@nostube/core/content-safety'
import { getInstanceConfig, instanceRelays } from '@nostube/core/instance-config'

const instance = getInstanceConfig()

/**
 * Instance build (nostube-server ADR 0005): laid over the saved settings on every load and
 * never written back. videoSources get read, interactionRelays get read+write (playlists,
 * likes and notifications are published and read there; video-kind requests stay scoped to
 * videoSources by the relay pool), uploads go only to the instance's root-mounted Blossom
 * (nostube-server ADR 0004), no mirrors or caching servers, no view tracking, no preset.
 * Viewer prefs (theme, quality, NSFW, video type) stay.
 */
const instanceOverlay: Partial<AppConfig> | null = instance && {
  relays: instanceRelays(instance).map(url => ({
    url,
    name: url,
    tags: instance.interactionRelays.includes(url)
      ? (['read', 'write'] as RelayTag[])
      : (['read'] as RelayTag[]),
  })),
  blossomServers: [
    { url: instance.origin, name: new URL(instance.origin).host, tags: ['initial upload'] },
  ],
  cachingServers: [],
  selectedPresetPubkey: null,
  viewTrackingEnabled: false,
  viewTrackingRelays: [],
}

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
  const [storedConfig, setConfig] = useLocalStorage<AppConfig>(storageKey, defaultConfig)

  // Consumers only ever see the effective NSFW mode: an opt-in without the 18+
  // confirmation (older configs, hand-edited storage) counts as 'hide'.
  const nsfwFilter = getEffectiveNsfwFilter(storedConfig)
  const config = useMemo(() => {
    const effective =
      storedConfig.nsfwFilter === nsfwFilter ? storedConfig : { ...storedConfig, nsfwFilter }
    return instanceOverlay ? { ...effective, ...instanceOverlay } : effective
  }, [storedConfig, nsfwFilter])

  // MIGRATION: Show YouTube content by default for existing saved configs.
  useEffect(() => {
    if (config.showYouTubeContent === undefined) {
      setConfig(currentConfig => ({
        ...currentConfig,
        showYouTubeContent: true,
      }))
    }
  }, [config.showYouTubeContent, setConfig])

  // MIGRATION: Show audio-only content by default for existing saved configs.
  useEffect(() => {
    if (config.showAudioContent === undefined) {
      setConfig(currentConfig => ({
        ...currentConfig,
        showAudioContent: true,
      }))
    }
  }, [config.showAudioContent, setConfig])

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [relayOverride, setRelayOverride] = useState<string | null>(null)

  //const { user } = useCurrentUser();
  // const userRelays = useUserRelays(user?.pubkey);

  // Generic config updater with callback pattern
  const updateConfig = useCallback(
    (updater: (currentConfig: AppConfig) => AppConfig) => {
      setConfig(updater)
    },
    [setConfig]
  )

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
  const appContextValue: AppContextType = useMemo(
    () => ({
      config,
      updateConfig,
      presetRelays,
      isSidebarOpen,
      toggleSidebar,
      relayOverride,
      setRelayOverride,
      pool: relayPool,
    }),
    [config, updateConfig, presetRelays, isSidebarOpen, toggleSidebar, relayOverride]
  )

  return (
    <AppContext.Provider value={appContextValue}>
      <NostubeHostBridge>{children}</NostubeHostBridge>
    </AppContext.Provider>
  )
}

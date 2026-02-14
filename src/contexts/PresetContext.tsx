import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { map } from 'rxjs'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from '@/hooks/useAppContext'
import { METADATA_RELAY, presetRelays } from '@/constants/relays'
import {
  type NostubePreset,
  type NostubePresetContent,
  PRESET_EVENT_KIND,
  PRESET_D_TAG,
  DEFAULT_PRESET_PUBKEY,
  EMPTY_PRESET_CONTENT,
} from '@/types/preset'
import { parsePresetEvent } from '@/hooks/usePresets'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getCachedPreset,
  setCachedPreset,
  CACHE_KEY,
  LOAD_TIMEOUT,
  type CacheResult,
} from '@/lib/preset-storage'

type PresetStatus = 'loading' | 'loaded' | 'error'

interface PresetContextValue {
  preset: NostubePreset | null
  presetContent: NostubePresetContent
  selectedPubkey: string
  setSelectedPreset: (pubkey: string | null) => void
}

const PresetContext = createContext<PresetContextValue | null>(null)

interface PresetProviderProps {
  children: ReactNode
}

export function PresetProvider({ children }: PresetProviderProps) {
  const eventStore = useEventStore()
  const { pool, config, updateConfig } = useAppContext()

  // Get selected pubkey from config, fall back to default
  const selectedPubkey = config.selectedPresetPubkey ?? DEFAULT_PRESET_PUBKEY

  // Check for cached preset immediately (stale-while-revalidate)
  const [cacheResult] = useState<CacheResult | null>(() => getCachedPreset(selectedPubkey))
  const cachedPreset = cacheResult?.preset ?? null

  // Track loading state - start as 'loaded' if we have a cached preset (even if stale)
  const [status, setStatus] = useState<PresetStatus>(() => (cachedPreset ? 'loaded' : 'loading'))
  const [retryCount, setRetryCount] = useState(0)

  // Query event store for the selected preset
  const presetEvent = use$(
    () =>
      eventStore
        .replaceable(PRESET_EVENT_KIND, selectedPubkey, PRESET_D_TAG)
        .pipe(map(event => event ?? undefined)),
    [eventStore, selectedPubkey]
  )

  // Build list of relays to query
  const discoveryRelays = useMemo(() => {
    const urls = new Set<string>()
    config.relays.forEach(relay => urls.add(relay.url))
    presetRelays.forEach(relay => urls.add(relay.url))
    urls.add(METADATA_RELAY)
    return Array.from(urls)
  }, [config.relays])

  // Fetch the preset from relays
  useEffect(() => {
    if (!selectedPubkey || discoveryRelays.length === 0) return

    // Track if we received a valid event in this effect run
    let receivedEvent = false

    const loader = createAddressLoader(pool, {
      eventStore,
      bufferTime: 0, // Don't batch - emit first result immediately
    })
    const subscription = loader({
      kind: PRESET_EVENT_KIND,
      pubkey: selectedPubkey,
      identifier: PRESET_D_TAG,
      relays: discoveryRelays,
    }).subscribe({
      next: event => {
        if (event) {
          receivedEvent = true
          eventStore.add(event)
          setStatus('loaded')
        }
      },
      error: err => {
        console.warn('[PresetProvider] Failed to load preset:', err)
      },
    })

    // Timeout - only fail if no cached preset and no event received
    const timeout = setTimeout(() => {
      if (!receivedEvent && !cachedPreset) {
        console.warn('[PresetProvider] Preset load timeout')
        setStatus('error')
      }
    }, LOAD_TIMEOUT)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [selectedPubkey, discoveryRelays, pool, eventStore, retryCount, cachedPreset])

  // Parse the preset event
  const preset = useMemo(() => {
    if (presetEvent) {
      const parsed = parsePresetEvent(presetEvent)
      if (parsed) {
        // Update cache when we get fresh data
        setCachedPreset(parsed, selectedPubkey)
        return parsed
      }
    }
    // Fall back to cached preset
    if (cachedPreset) {
      return cachedPreset
    }
    return null
  }, [presetEvent, cachedPreset, selectedPubkey])

  // Function to change the selected preset
  const setSelectedPreset = useCallback(
    (pubkey: string | null) => {
      updateConfig(currentConfig => ({
        ...currentConfig,
        selectedPresetPubkey: pubkey,
      }))
      // Clear cache when changing preset
      localStorage.removeItem(CACHE_KEY)
      setStatus('loading')
    },
    [updateConfig]
  )

  // Retry handler
  const handleRetry = useCallback(() => {
    setStatus('loading')
    setRetryCount(c => c + 1)
  }, [])

  // Return preset content or empty fallback
  const presetContent: NostubePresetContent = preset || EMPTY_PRESET_CONTENT

  const contextValue = useMemo<PresetContextValue>(
    () => ({
      preset,
      presetContent,
      selectedPubkey,
      setSelectedPreset,
    }),
    [preset, presetContent, selectedPubkey, setSelectedPreset]
  )

  // Show loading state
  if (status === 'loading' && !cachedPreset) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading app configuration...</p>
      </div>
    )
  }

  // Show error state
  if (status === 'error' && !preset) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Failed to load configuration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Could not connect to Nostr relays to load app preset.
          </p>
        </div>
        <Button onClick={handleRetry} variant="outline" className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return <PresetContext.Provider value={contextValue}>{children}</PresetContext.Provider>
}

export function usePresetContext(): PresetContextValue {
  const context = useContext(PresetContext)
  if (!context) {
    throw new Error('usePresetContext must be used within a PresetProvider')
  }
  return context
}

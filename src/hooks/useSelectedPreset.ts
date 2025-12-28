import { useEffect, useMemo, useState, useCallback } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { map } from 'rxjs'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY, presetRelays } from '@/constants/relays'
import {
  type NostubePreset,
  type NostubePresetContent,
  PRESET_EVENT_KIND,
  PRESET_D_TAG,
  DEFAULT_PRESET_PUBKEY,
  EMPTY_PRESET_CONTENT,
} from '@/types/preset'
import { parsePresetEvent } from './usePresets'

const CACHE_KEY = 'nostube_preset_cache'
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

interface CachedPreset {
  preset: NostubePreset
  cachedAt: number
}

function getCachedPreset(): NostubePreset | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const parsed: CachedPreset = JSON.parse(cached)
    if (Date.now() - parsed.cachedAt > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return parsed.preset
  } catch {
    return null
  }
}

function setCachedPreset(preset: NostubePreset) {
  try {
    const cached: CachedPreset = {
      preset,
      cachedAt: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Hook to get the currently selected preset with caching
 */
export function useSelectedPreset() {
  const eventStore = useEventStore()
  const { pool, config, updateConfig } = useAppContext()

  // Get selected pubkey from config, fall back to default
  const selectedPubkey = config.selectedPresetPubkey ?? DEFAULT_PRESET_PUBKEY

  // Start with cached preset for instant hydration
  const [cachedPreset] = useState<NostubePreset | null>(() => getCachedPreset())
  const [isLoading, setIsLoading] = useState(true)

  // Query event store for the selected preset
  const presetObservable = useMemo(
    () =>
      eventStore
        .replaceable(PRESET_EVENT_KIND, selectedPubkey, PRESET_D_TAG)
        .pipe(map(event => event ?? undefined)),
    [eventStore, selectedPubkey]
  )
  const presetEvent = useObservableState(presetObservable)

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

    queueMicrotask(() => setIsLoading(true))

    const loader = createAddressLoader(pool)
    const subscription = loader({
      kind: PRESET_EVENT_KIND,
      pubkey: selectedPubkey,
      identifier: PRESET_D_TAG,
      relays: discoveryRelays,
    }).subscribe({
      next: event => {
        if (event) {
          eventStore.add(event)
        }
        setIsLoading(false)
      },
      error: err => {
        console.warn('[useSelectedPreset] Failed to load preset:', err)
        setIsLoading(false)
      },
    })

    // Set loading to false after timeout
    const timeout = setTimeout(() => {
      setIsLoading(false)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [selectedPubkey, discoveryRelays, pool, eventStore])

  // Parse the preset event
  const preset = useMemo(() => {
    if (presetEvent) {
      const parsed = parsePresetEvent(presetEvent)
      if (parsed) {
        // Update cache when we get fresh data
        setCachedPreset(parsed)
        return parsed
      }
    }
    // Fall back to cached preset while loading
    if (cachedPreset && cachedPreset.pubkey === selectedPubkey) {
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
    },
    [updateConfig]
  )

  // Return preset content or empty fallback
  const presetContent: NostubePresetContent = preset || EMPTY_PRESET_CONTENT

  return {
    preset,
    presetContent,
    selectedPubkey,
    isLoading: isLoading && !cachedPreset,
    setSelectedPreset,
  }
}

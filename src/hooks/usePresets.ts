import { useEffect, useMemo, useState } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY, presetRelays } from '@/constants/relays'
import {
  type NostubePreset,
  type NostubePresetContent,
  PRESET_EVENT_KIND,
  PRESET_D_TAG,
  EMPTY_PRESET_CONTENT,
} from '@/types/preset'
import type { NostrEvent } from 'nostr-tools'

/**
 * Parse a preset event into a NostubePreset object
 */
export function parsePresetEvent(event: NostrEvent): NostubePreset | null {
  try {
    const nameTag = event.tags.find(t => t[0] === 'name')
    const descriptionTag = event.tags.find(t => t[0] === 'description')

    let content: NostubePresetContent
    try {
      content = JSON.parse(event.content)
    } catch {
      content = EMPTY_PRESET_CONTENT
    }

    return {
      name: nameTag?.[1] || 'Unnamed Preset',
      description: descriptionTag?.[1],
      pubkey: event.pubkey,
      createdAt: event.created_at,
      defaultRelays: content.defaultRelays || [],
      defaultBlossomProxy: content.defaultBlossomProxy,
      blockedPubkeys: content.blockedPubkeys || [],
      nsfwPubkeys: content.nsfwPubkeys || [],
      blockedEvents: content.blockedEvents || [],
    }
  } catch (error) {
    console.error('[usePresets] Failed to parse preset event:', error)
    return null
  }
}

/**
 * Hook to fetch all nostube presets from relays
 */
export function usePresets() {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const [isLoading, setIsLoading] = useState(true)

  // Query event store for all preset events
  const presetsObservable = eventStore.timeline([
    {
      kinds: [PRESET_EVENT_KIND],
      '#d': [PRESET_D_TAG],
    },
  ])

  const presetEvents = useObservableState(presetsObservable, [])

  // Build list of relays to query
  const discoveryRelays = useMemo(() => {
    const urls = new Set<string>()
    config.relays.forEach(relay => urls.add(relay.url))
    presetRelays.forEach(relay => urls.add(relay.url))
    urls.add(METADATA_RELAY)
    return Array.from(urls)
  }, [config.relays])

  // Fetch presets from relays
  useEffect(() => {
    if (discoveryRelays.length === 0) return

    queueMicrotask(() => setIsLoading(true))

    const loader = createTimelineLoader(
      pool,
      discoveryRelays,
      {
        kinds: [PRESET_EVENT_KIND],
        '#d': [PRESET_D_TAG],
        limit: 100,
      },
      {
        eventStore,
        limit: 100,
      }
    )

    const subscription = loader().subscribe({
      next: event => {
        eventStore.add(event)
      },
      error: err => {
        console.warn('[usePresets] Failed to load presets:', err)
        setIsLoading(false)
      },
      complete: () => {
        setIsLoading(false)
      },
    })

    // Set loading to false after a timeout if no events received
    const timeout = setTimeout(() => {
      setIsLoading(false)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [discoveryRelays, pool, eventStore])

  // Parse events into preset objects, deduplicate by pubkey (keep newest)
  const presets = useMemo(() => {
    const presetMap = new Map<string, NostubePreset>()

    for (const event of presetEvents) {
      const preset = parsePresetEvent(event)
      if (preset) {
        const existing = presetMap.get(preset.pubkey)
        if (!existing || preset.createdAt > existing.createdAt) {
          presetMap.set(preset.pubkey, preset)
        }
      }
    }

    // Sort by createdAt descending (newest first)
    return Array.from(presetMap.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [presetEvents])

  return {
    presets,
    isLoading,
  }
}

import { useMemo } from 'react'
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
import { useNostrQuery } from '@/nostr/useNostrQuery'

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
      defaultThumbResizeServer: content.defaultThumbResizeServer,
      blockedPubkeys: content.blockedPubkeys || [],
      nsfwPubkeys: content.nsfwPubkeys || [],
      blockedEvents: content.blockedEvents || [],
    }
  } catch (error) {
    console.error('[usePresets] Failed to parse preset event:', error)
    return null
  }
}

const PRESET_FILTER = { kinds: [PRESET_EVENT_KIND], '#d': [PRESET_D_TAG], limit: 100 }

/**
 * Hook to fetch all nostube presets from relays
 */
export function usePresets() {
  const { config } = useAppContext()

  const discoveryRelays = useMemo(() => {
    const urls = new Set<string>()
    config.relays.forEach(relay => urls.add(relay.url))
    presetRelays.forEach(relay => urls.add(relay.url))
    urls.add(METADATA_RELAY)
    return Array.from(urls)
  }, [config.relays])

  const { events: presetEvents, isLoading } = useNostrQuery(PRESET_FILTER, {
    relays: discoveryRelays,
  })

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

    return Array.from(presetMap.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [presetEvents])

  return { presets, isLoading }
}

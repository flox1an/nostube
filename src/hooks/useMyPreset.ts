import { useEffect, useMemo, useState, useCallback } from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { of, map } from 'rxjs'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
import { useCurrentUser } from './useCurrentUser'
import { useNostrPublish } from './useNostrPublish'
import { METADATA_RELAY, presetRelays } from '@/constants/relays'
import {
  type NostubePreset,
  type NostubePresetContent,
  PRESET_EVENT_KIND,
  PRESET_D_TAG,
} from '@/types/preset'
import { parsePresetEvent } from './usePresets'
import { nowInSecs } from '@/lib/utils'

export interface PresetFormData {
  name: string
  description: string
  defaultRelays: string[]
  defaultBlossomProxy: string
  defaultThumbResizeServer: string
  blockedPubkeys: string[]
  nsfwPubkeys: string[]
  blockedEvents: string[]
}

/**
 * Hook to get and edit the current user's preset
 */
export function useMyPreset() {
  const eventStore = useEventStore()
  const { pool, config } = useAppContext()
  const { user } = useCurrentUser()
  const { publish, isPending: isPublishing } = useNostrPublish()
  const [isLoading, setIsLoading] = useState(true)

  const userPubkey = user?.pubkey

  // Query event store for user's preset
  const presetEvent = use$(
    () =>
      userPubkey
        ? eventStore
            .replaceable(PRESET_EVENT_KIND, userPubkey, PRESET_D_TAG)
            .pipe(map(event => event ?? undefined))
        : of(undefined),
    [eventStore, userPubkey]
  )

  // Build list of relays to query
  const discoveryRelays = useMemo(() => {
    const urls = new Set<string>()
    config.relays.forEach(relay => urls.add(relay.url))
    presetRelays.forEach(relay => urls.add(relay.url))
    urls.add(METADATA_RELAY)
    return Array.from(urls)
  }, [config.relays])

  // Fetch user's preset from relays
  useEffect(() => {
    if (!userPubkey || discoveryRelays.length === 0) {
      queueMicrotask(() => setIsLoading(false))
      return
    }

    console.log(discoveryRelays)

    queueMicrotask(() => setIsLoading(true))

    const loader = createAddressLoader(pool)
    const subscription = loader({
      kind: PRESET_EVENT_KIND,
      pubkey: userPubkey,
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
        console.warn('[useMyPreset] Failed to load preset:', err)
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
  }, [userPubkey, discoveryRelays, pool, eventStore])

  // Parse the preset event
  const preset: NostubePreset | null = useMemo(() => {
    if (presetEvent) {
      return parsePresetEvent(presetEvent)
    }
    return null
  }, [presetEvent])

  // Save preset to Nostr
  const savePreset = useCallback(
    async (formData: PresetFormData) => {
      if (!userPubkey) {
        throw new Error('User not logged in')
      }

      const content: NostubePresetContent = {
        defaultRelays: formData.defaultRelays.filter(r => r.trim()),
        defaultBlossomProxy: formData.defaultBlossomProxy.trim().replace(/\/+$/, '') || undefined,
        defaultThumbResizeServer:
          formData.defaultThumbResizeServer.trim().replace(/\/+$/, '') || undefined,
        blockedPubkeys: formData.blockedPubkeys.filter(p => p.trim()),
        nsfwPubkeys: formData.nsfwPubkeys.filter(p => p.trim()),
        blockedEvents: formData.blockedEvents.filter(e => e.trim()),
      }

      const tags: string[][] = [
        ['d', PRESET_D_TAG],
        ['name', formData.name.trim() || 'Unnamed Preset'],
      ]

      if (formData.description.trim()) {
        tags.push(['description', formData.description.trim()])
      }

      const event = {
        kind: PRESET_EVENT_KIND,
        content: JSON.stringify(content),
        created_at: nowInSecs(),
        tags,
      }

      // Publish to all user relays + preset discovery relays for maximum visibility
      const allRelays = new Set<string>()
      config.relays.forEach(r => allRelays.add(r.url))
      presetRelays.forEach(r => allRelays.add(r.url))
      allRelays.add(METADATA_RELAY)

      const signedEvent = await publish({ event, relays: Array.from(allRelays) })

      // Add to event store for immediate update
      eventStore.add(signedEvent)

      return signedEvent
    },
    [userPubkey, publish, config.relays, eventStore]
  )

  return {
    preset,
    isLoading,
    isPublishing,
    savePreset,
    hasPreset: !!preset,
  }
}

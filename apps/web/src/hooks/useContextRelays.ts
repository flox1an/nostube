import { useMemo } from 'react'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import type { NostrEvent } from 'nostr-tools'
import { combineRelays } from '@/lib/utils'
import { useReadRelays } from './useReadRelays'
import { useUserRelays } from './useUserRelays'
import { presetRelays, METADATA_RELAYS } from '@/constants/relays'
import { getInstanceConfig, instanceRelays } from '@nostube/core/instance-config'

// Instance build: hints, seen relays, outbox and presets never widen the relay set.
const instance = getInstanceConfig()

/**
 * Hook specifically for video pages.
 * Combines relays from nevent, video event, playlist event, and author.
 */
export function useVideoPageRelays(params: {
  neventRelays?: string[]
  videoEvent?: NostrEvent
  playlistEvent?: NostrEvent
  authorPubkey?: string
}): string[] {
  const { neventRelays, videoEvent, playlistEvent, authorPubkey } = params

  // Memoize arrays to prevent new references on every render
  const stableNeventRelays = useMemo(() => neventRelays || [], [neventRelays])
  const stableAdditionalEvents = useMemo(
    () => (playlistEvent ? [playlistEvent] : []),
    [playlistEvent]
  )

  const userReadRelays = useReadRelays()
  const { data: authorRelays } = useUserRelays(authorPubkey)
  const presetRelayUrls = useMemo(() => presetRelays.map(r => r.url), [])

  return useMemo(() => {
    if (instance) return instanceRelays(instance)
    const relaySources: string[][] = []

    // 1. NIP-19 relays (nevent relays)
    if (stableNeventRelays.length > 0) {
      relaySources.push(stableNeventRelays)
    }

    // 2. Context event seen relays (video event)
    if (videoEvent) {
      const seenRelaysSet = getSeenRelays(videoEvent)
      if (seenRelaysSet) {
        relaySources.push(Array.from(seenRelaysSet))
      }
    }

    // 3. Additional events seen relays (playlist event)
    for (const event of stableAdditionalEvents) {
      const seenRelaysSet = getSeenRelays(event)
      if (seenRelaysSet) {
        relaySources.push(Array.from(seenRelaysSet))
      }
    }

    // 4. Author's NIP-65 outbox relays
    if (authorRelays && authorRelays.length > 0) {
      const outboxRelays = authorRelays.filter(r => r.write).map(r => r.url)
      if (outboxRelays.length > 0) {
        relaySources.push(outboxRelays)
      }
    }

    // 5. User's configured read relays
    relaySources.push(userReadRelays)

    // 6. Preset fallback relays
    relaySources.push(presetRelayUrls)

    return combineRelays(relaySources)
  }, [
    stableNeventRelays,
    videoEvent,
    stableAdditionalEvents,
    authorRelays,
    userReadRelays,
    presetRelayUrls,
  ])
}

/**
 * Hook specifically for author pages.
 * Combines relays from nprofile, author's NIP-65 relays, and user config.
 * Always includes purplepag.es for better profile/relay list discovery.
 */
export function useAuthorPageRelays(params: {
  nprofileRelays?: string[]
  authorPubkey: string
}): string[] {
  const { nprofileRelays, authorPubkey } = params

  // Memoize nprofileRelays to prevent new array creation
  const stableNprofileRelays = useMemo(() => nprofileRelays || [], [nprofileRelays])

  const userReadRelays = useReadRelays()
  const { data: authorRelays } = useUserRelays(authorPubkey)
  const presetRelayUrls = useMemo(() => presetRelays.map(r => r.url), [])

  return useMemo(() => {
    if (instance) return instanceRelays(instance)
    const relaySources: string[][] = []

    // 1. NIP-19 relays (nprofile relays)
    if (stableNprofileRelays.length > 0) {
      relaySources.push(stableNprofileRelays)
    }

    // 2. Author's NIP-65 outbox relays
    if (authorRelays && authorRelays.length > 0) {
      const outboxRelays = authorRelays.filter(r => r.write).map(r => r.url)
      if (outboxRelays.length > 0) {
        relaySources.push(outboxRelays)
      }
    }

    // 3. User's configured read relays
    relaySources.push(userReadRelays)

    // 4. Preset fallback relays
    relaySources.push(presetRelayUrls)

    // 5. Always include METADATA_RELAYS for profile metadata and NIP-65 relay lists
    relaySources.push(METADATA_RELAYS)

    return combineRelays(relaySources)
  }, [stableNprofileRelays, authorRelays, userReadRelays, presetRelayUrls])
}

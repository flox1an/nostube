import { useEffect, useMemo } from 'react'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { getOutboxes } from 'applesauce-core/helpers/mailboxes'
import { mergeRelaySets } from 'applesauce-core/helpers/relays'
import { of } from 'rxjs'
import type { NostubeClient } from '@nostube/core/client'
import { DEFAULT_PROFILE_RELAYS, getInstanceConfig } from '@nostube/core/instance-config'
import { useNostubeHost } from '@nostube/widgets/host'

/**
 * The signed-in visitor always uses public profile discovery, plus the instance's
 * configured relays and the visitor's NIP-65 outboxes. An empty config list only
 * removes custom lookup relays; it cannot disable discovery of the visitor's identity.
 * Only the visitor's identity goes there, never the video catalog.
 */
export function visitorProfileRelays(
  instanceRelays: string[],
  profileRelays: string[],
  outboxes: string[]
): string[] {
  return mergeRelaySets(outboxes, instanceRelays, profileRelays, DEFAULT_PROFILE_RELAYS)
}

export function useVisitorProfile(client: NostubeClient, pubkey?: string) {
  const eventStore = useEventStore()
  const { relays } = useNostubeHost()
  const mailboxes = use$(
    () => (pubkey ? eventStore.replaceable(10002, pubkey) : of(undefined)),
    [eventStore, pubkey]
  )
  const profileRelays = useMemo(
    () =>
      visitorProfileRelays(
        mergeRelaySets(relays.metadata, relays.indexer),
        getInstanceConfig()?.profileRelays ?? DEFAULT_PROFILE_RELAYS,
        mailboxes ? getOutboxes(mailboxes) : []
      ),
    [mailboxes, relays.metadata, relays.indexer]
  )

  useEffect(() => {
    if (!pubkey) return
    const subscription = client.requestVisitorIdentity(pubkey, profileRelays).subscribe({
      error: error => console.warn('[Site] Could not load visitor identity:', error),
    })
    return () => subscription.unsubscribe()
  }, [client, profileRelays, pubkey])

  return use$(() => (pubkey ? eventStore.profile(pubkey) : of(undefined)), [eventStore, pubkey])
}

import { useEffect, useMemo } from 'react'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { getOutboxes } from 'applesauce-core/helpers/mailboxes'
import { mergeRelaySets } from 'applesauce-core/helpers/relays'
import { of } from 'rxjs'
import type { NostubeClient } from '@nostube/core/client'
import { DEFAULT_PROFILE_RELAYS, getInstanceConfig } from '@nostube/core/instance-config'
import { useNostubeHost } from '@nostube/widgets/host'

/**
 * Where the signed-in visitor's identity is looked up: the instance relays plus the instance's
 * `profileRelays` (public discovery by default) and the visitor's own outboxes. An empty
 * `profileRelays` keeps it on the instance relays (local only, nostube-server ADR 0008).
 * Only the visitor's identity goes there, never the video catalog.
 */
export function visitorProfileRelays(
  instanceRelays: string[],
  profileRelays: string[],
  outboxes: string[]
): string[] {
  return profileRelays.length
    ? mergeRelaySets(outboxes, instanceRelays, profileRelays)
    : mergeRelaySets(instanceRelays)
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

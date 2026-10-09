import { useEffect, useMemo } from 'react'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { getOutboxes } from 'applesauce-core/helpers/mailboxes'
import { mergeRelaySets } from 'applesauce-core/helpers/relays'
import { of } from 'rxjs'
import type { NostubeClient } from '@nostube/core/client'
import { useNostubeHost } from '@nostube/widgets/host'

// Only the signed-in visitor's identity uses public discovery, never the video catalog.
const PROFILE_RELAYS = ['wss://purplepag.es', 'wss://index.hzrd149.com']

export function useVisitorProfile(client: NostubeClient, pubkey?: string) {
  const eventStore = useEventStore()
  const { relays } = useNostubeHost()
  const mailboxes = use$(
    () => (pubkey ? eventStore.replaceable(10002, pubkey) : of(undefined)),
    [eventStore, pubkey]
  )
  const profileRelays = useMemo(
    () =>
      mergeRelaySets(
        mailboxes ? getOutboxes(mailboxes) : [],
        relays.metadata,
        relays.indexer,
        PROFILE_RELAYS
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

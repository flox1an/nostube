import { useEventModel, useEventStore } from 'applesauce-react/hooks'
import { ContactsModel } from 'applesauce-core/models'
import { useCurrentUser } from './useCurrentUser'
import { useEffect, useMemo } from 'react'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { kinds } from 'nostr-tools'
import { useAppContext } from './useAppContext'
import { METADATA_RELAY } from '@/constants/relays'

export function useFollowedAuthors() {
  const { user } = useCurrentUser()
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()

  // Use ContactsModel to get user's contact list
  // ContactsModel expects a tuple [pubkey] or null/undefined
  const contacts = useEventModel(ContactsModel, user?.pubkey ? [user.pubkey] : null)

  const readRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('read')).map(relay => relay.url)
  }, [config.relays])

  // Combine read relays with METADATA_RELAY for better profile/contact discovery
  const relaysWithMetadata = useMemo(() => {
    return [...readRelays, METADATA_RELAY]
  }, [readRelays])

  useEffect(() => {
    // Only load if user exists and contacts event is not already in store
    if (user?.pubkey && !eventStore.hasReplaceable(kinds.Contacts, user.pubkey)) {
      const loader = createAddressLoader(pool)
      const subscription = loader({
        kind: kinds.Contacts,
        pubkey: user.pubkey,
        relays: relaysWithMetadata,
      }).subscribe(e => eventStore.add(e))

      // Cleanup subscription on unmount or user change
      return () => subscription.unsubscribe()
    }
  }, [user?.pubkey, eventStore, pool, relaysWithMetadata])

  const followedPubkeys = useMemo(() => {
    return contacts || []
  }, [contacts])

  return {
    data: followedPubkeys,
    isLoading: user && !contacts,
    enabled: !!user?.pubkey,
  }
}

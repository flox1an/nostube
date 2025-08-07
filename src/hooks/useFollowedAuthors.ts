import { useEventModel, useEventStore } from 'applesauce-react/hooks';
import { ContactsModel } from 'applesauce-core/models';
import { useCurrentUser } from './useCurrentUser';
import { useEffect, useMemo } from 'react';
import { createAddressLoader } from 'applesauce-loaders/loaders';
import { kinds } from 'nostr-tools';
import { useAppContext } from './useAppContext';


export function useFollowedAuthors() {
  const { user } = useCurrentUser();
  const { pool, config } = useAppContext();
  const eventStore = useEventStore();

  // Use ContactsModel to get user's contact list
  const contacts = useEventModel(ContactsModel, user?.pubkey ? [user.pubkey] : null);

  const readRelays = useMemo(() => {
    return config.relays.filter(relay => relay.tags.includes('read')).map(relay => relay.url);
  }, [config.relays]);

  useEffect(() => {
    if (contacts && contacts.length === 0 && user?.pubkey) {
      console.log('contacts', contacts);
      
      const loader = createAddressLoader(pool);
      loader({
        kind: kinds.Contacts,
        pubkey: user?.pubkey,
        relays: readRelays,
      }).subscribe(e => eventStore.add(e));
    }
  }, [contacts]);


  console.log('contacts', contacts);

  const followedPubkeys = useMemo(() => {
    return contacts || [];
  }, [contacts]);

  return {
    data: followedPubkeys,
    isLoading: user && !contacts,
    enabled: !!user?.pubkey,
  };
}

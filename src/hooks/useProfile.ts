import { kinds } from 'nostr-tools';
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks';
import { ProfileContent } from 'applesauce-core/helpers/profile';
import { createAddressLoader } from 'applesauce-loaders/loaders';
import { ProfilePointer } from 'nostr-tools/nip19';
import { Model } from 'applesauce-core';
import { defer, EMPTY, ignoreElements, merge } from 'rxjs';
import { useAppContext } from './useAppContext';

// Create a relay pool to make relay connections

export function useProfile(user?: ProfilePointer): ProfileContent | undefined {
  const eventStore = useEventStore();
  const { pool } = useAppContext();
  if (!user) return undefined;

  const addressLoader = createAddressLoader(pool, {
    eventStore,
    lookupRelays: ['wss://purplepag.es', 'wss://index.hzrd149.com'],
  });

  function ProfileQuery(user: ProfilePointer): Model<ProfileContent | undefined> {
    return events =>
      merge(
        // Load the profile if its not found in the event store
        defer(() => {
          if (events.hasReplaceable(kinds.Metadata, user.pubkey)) return EMPTY;
          else return addressLoader({ kind: kinds.Metadata, ...user }).pipe(ignoreElements());
        }),
        // Subscribe to the profile content
        events.profile(user.pubkey)
      );
  }

  return useObservableMemo(() => eventStore.model(ProfileQuery, user), [user.pubkey, user.relays?.join('|')]);
}

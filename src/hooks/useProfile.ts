import { kinds } from 'nostr-tools'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { ProfileContent } from 'applesauce-core/helpers/profile'
import { ProfilePointer } from 'nostr-tools/nip19'
import { Model } from 'applesauce-core'
import { defer, EMPTY, merge, of } from 'rxjs'
import { requestProfile } from './useBatchedProfiles'

export function useProfile(user?: ProfilePointer): ProfileContent | undefined {
  const eventStore = useEventStore()

  function ProfileQuery(user?: ProfilePointer): Model<ProfileContent | undefined> {
    // Return undefined if user is not provided or pubkey is empty/invalid
    if (!user || !user.pubkey || user.pubkey.trim() === '') {
      return () => of(undefined)
    }

    return events =>
      merge(
        // Request profile to be loaded via batched loader
        defer(() => {
          if (events.hasReplaceable(kinds.Metadata, user.pubkey)) return EMPTY
          else {
            // Request this profile be loaded (will be batched)
            requestProfile(user.pubkey)
            return EMPTY
          }
        }),
        // Subscribe to the profile content
        events.profile(user.pubkey)
      )
  }

  return useObservableMemo(() => eventStore.model(ProfileQuery, user), [user])
}

import { kinds } from 'nostr-tools'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { type ProfileContent } from 'applesauce-core/helpers/profile'
import { type ProfilePointer } from 'nostr-tools/nip19'
import { type Model } from 'applesauce-core'
import { defer, EMPTY, merge, of } from 'rxjs'
import { requestProfile } from './useBatchedProfiles'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

export function useProfile(user?: ProfilePointer): ProfileContent | undefined {
  const eventStore = useEventStore()
  const { pool } = useAppContext()

  function ProfileQuery(user?: ProfilePointer): Model<ProfileContent | undefined> {
    // Return undefined if user is not provided or pubkey is empty/invalid
    if (!user || !user.pubkey || user.pubkey.trim() === '') {
      return () => of(undefined)
    }

    return events =>
      merge(
        // Request profile to be loaded
        defer(() => {
          if (events.hasReplaceable(kinds.Metadata, user.pubkey)) return EMPTY
          else {
            // If custom relays are provided in the profile pointer, use them
            if (user.relays && user.relays.length > 0) {
              // Load directly from the specified relays
              const loader = createTimelineLoader(
                pool,
                user.relays,
                {
                  kinds: [kinds.Metadata],
                  authors: [user.pubkey],
                },
                {
                  eventStore,
                  limit: 1,
                }
              )

              loader().subscribe({
                error: err => {
                  console.error('[Profile Loader] Error loading profile from custom relays:', err)
                },
              })
            } else {
              // Use batched loader for profiles without custom relays
              requestProfile(user.pubkey)
            }
            return EMPTY
          }
        }),
        // Subscribe to the profile content
        events.profile(user.pubkey)
      )
  }

  return use$(() => eventStore.model(ProfileQuery, user), [user])
}

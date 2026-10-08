import { kinds } from 'nostr-tools'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { type ProfileContent } from 'applesauce-core/helpers/profile'
import { type ProfilePointer } from 'nostr-tools/nip19'
import { type Model } from 'applesauce-core'
import { defer, EMPTY, merge, of } from 'rxjs'
import { requestProfile } from './useBatchedProfiles'
import { useAppContext } from './useAppContext'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { type RelayPool } from 'applesauce-relay'

/**
 * Module-level model factory.
 *
 * `EventStore.model()` caches by the *identity* of this function (a Map keyed
 * on the constructor) and then by `hash_sum(args)`. Declaring it inside the
 * hook gave it a fresh identity on every render, so the cache never hit, a new
 * `share()` pipeline was built per render, and `eventStore.models` grew
 * unbounded. Each teardown dropped the shared model to refCount 0, arming
 * applesauce's 60s `modelKeepWarm` timer — thousands of `setInterval(60000)`
 * installs during a feed render.
 */
function ProfileQuery(
  pool: RelayPool,
  pubkey?: string,
  relays?: string[]
): Model<ProfileContent | undefined> {
  if (!pubkey) return () => of(undefined)

  return events =>
    merge(
      // Request profile to be loaded
      defer(() => {
        if (events.hasReplaceable(kinds.Metadata, pubkey)) return EMPTY

        if (relays && relays.length > 0) {
          // Load directly from the relays named in the profile pointer
          const loader = createTimelineLoader(
            pool,
            relays,
            { kinds: [kinds.Metadata], authors: [pubkey] },
            { eventStore: events, limit: 1 }
          )

          loader().subscribe({
            error: err => {
              console.error('[Profile Loader] Error loading profile from custom relays:', err)
            },
          })
        } else {
          // Use batched loader for profiles without custom relays
          requestProfile(pubkey)
        }
        return EMPTY
      }),
      // Subscribe to the profile content
      events.profile(pubkey)
    )
}

/**
 * Cache key for {@link ProfileQuery}. Without it applesauce falls back to
 * `hash_sum(args)`, which would deep-hash the whole {@link RelayPool}.
 */
ProfileQuery.getKey = (_pool: RelayPool, pubkey?: string, relays?: string[]) =>
  `${pubkey ?? ''}|${relays?.join(',') ?? ''}`

export function useProfile(user?: ProfilePointer): ProfileContent | undefined {
  const eventStore = useEventStore()
  const { pool } = useAppContext()

  const pubkey = user?.pubkey && user.pubkey.trim() !== '' ? user.pubkey : undefined
  // Callers pass inline pointer literals, so depend on primitives only —
  // an unstable dep here makes `use$` resubscribe on every render.
  const relaysKey = user?.relays?.length ? user.relays.join(',') : undefined

  return use$(() => {
    const relays = relaysKey ? relaysKey.split(',') : undefined
    return eventStore.model(ProfileQuery, pool, pubkey, relays)
  }, [eventStore, pool, pubkey, relaysKey])
}

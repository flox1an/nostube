import { useMemo } from 'react'
import { kinds } from 'nostr-tools'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { type ProfileContent } from 'applesauce-core/helpers/profile'
import { type ProfilePointer } from 'nostr-tools/nip19'
import { type Model } from 'applesauce-core'
import { defer, EMPTY, merge, of } from 'rxjs'
import { requestHintProfile } from './hint-profile-batch'
import { useNostubeHost } from '../host'
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

        // `events.profile()` below goes through the store's event loader, which
        // already asks the lookup relays for a missing kind 0. Only hint relays
        // outside that set need their own request.
        if (relays && relays.length > 0) {
          requestHintProfile(pool, events, relays, pubkey)
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
  const { pool, relays: hostRelays } = useNostubeHost()

  const pubkey = user?.pubkey && user.pubkey.trim() !== '' ? user.pubkey : undefined
  // Callers pass inline pointer literals, so depend on primitives only —
  // an unstable dep here makes `use$` resubscribe on every render.
  const relaysKey = user?.relays?.length ? user.relays.join(',') : undefined
  // Hints are usually relays the feed already queries (the video was seen on
  // them). Asking those again is a second REQ for the same profile; the
  // index/metadata request below covers them.
  const indexKey = `${hostRelays.read.join(',')}|${hostRelays.metadata.join(',')}`
  const hintsKey = useMemo(() => {
    if (!relaysKey) return undefined
    const indexed = new Set([...hostRelays.read, ...hostRelays.metadata])
    const hints = relaysKey.split(',').filter(relay => !indexed.has(relay))
    return hints.length > 0 ? hints.join(',') : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indexKey is the stable string form
  }, [relaysKey, indexKey])

  return use$(() => {
    const relays = hintsKey ? hintsKey.split(',') : undefined
    return eventStore.model(ProfileQuery, pool, pubkey, relays)
  }, [eventStore, pool, pubkey, hintsKey])
}

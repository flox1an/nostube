import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { kinds, type NostrEvent } from 'nostr-tools'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAppContext } from '@/hooks/useAppContext'
import { METADATA_RELAY } from '@/constants/relays'

/** NIP-51 multimedia (photos, short video) follow list */
export const MEDIA_FOLLOWS_KIND = 10020

const CACHE_KEY = 'nostr:follow-set-cache'

interface FollowSetContextValue {
  /** Live kind 10020 event, or null while it is still loading. */
  followSetEvent: NostrEvent | null
  /** Live kind 3 event, kept for kind-3 import detection. */
  kind3Event: NostrEvent | null
  /** True once the kind 10020 query has completed (EOSE). */
  followSetLoaded: boolean
  /** Pubkeys from the live kind 10020 event. Empty until it arrives. */
  followedPubkeys: string[]
  /**
   * Same as {@link followedPubkeys}, but falls back to the previous session's
   * persisted list while the live event is in flight. Feed surfaces use this
   * so the timeline REQ can leave before the follow set resolves.
   */
  optimisticFollowedPubkeys: string[]
}

const EMPTY: string[] = []

const FollowSetContext = createContext<FollowSetContextValue>({
  followSetEvent: null,
  kind3Event: null,
  followSetLoaded: false,
  followedPubkeys: EMPTY,
  optimisticFollowedPubkeys: EMPTY,
})

function readCache(pubkey: string): string[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY
    const entry = (parsed as Record<string, unknown>)[pubkey]
    if (!Array.isArray(entry)) return EMPTY
    return entry.filter((value): value is string => typeof value === 'string')
  } catch {
    return EMPTY
  }
}

function writeCache(pubkey: string, pubkeys: string[]): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    const store = typeof parsed === 'object' && parsed !== null ? (parsed as object) : {}
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...store, [pubkey]: pubkeys }))
  } catch {
    // Cache is a pure optimisation; quota or privacy-mode failures are ignored.
  }
}

interface FollowSetProviderProps {
  children: ReactNode
}

/**
 * Loads the logged-in user's follow set exactly once for the whole app.
 *
 * Previously every `useFollowSet()` consumer ran its own address loader.
 * The home route mounts five of them (onboarding dialog, three navigation
 * surfaces, the page itself, the trust filter), which produced four
 * duplicate kind-10020/kind-3 REQ rounds on the boot path.
 */
export function FollowSetProvider({ children }: FollowSetProviderProps) {
  const { user } = useCurrentUser()
  const { pool, config } = useAppContext()
  const eventStore = useEventStore()

  const [followSetEvent, setFollowSetEvent] = useState<NostrEvent | null>(null)
  const [kind3Event, setKind3Event] = useState<NostrEvent | null>(null)
  const [followSetLoaded, setFollowSetLoaded] = useState(false)

  const pubkey = user?.pubkey

  const relaysWithMetadata = useMemo(() => {
    const readRelays = config.relays
      .filter(relay => relay.tags.includes('read'))
      .map(relay => relay.url)
    return [...readRelays, METADATA_RELAY]
  }, [config.relays])

  // Load kind 10020 media follows list (NIP-51)
  useEffect(() => {
    if (!pubkey) return

    setFollowSetLoaded(false)
    // bufferTime: 0 — this loader is on the critical boot path; applesauce's
    // default 1000ms batching window would delay the follow set (and with it
    // the whole feed REQ) by a full second.
    const loader = createAddressLoader(pool, { bufferTime: 0 })
    const subscription = loader({
      kind: MEDIA_FOLLOWS_KIND,
      pubkey,
      relays: relaysWithMetadata,
    }).subscribe({
      next: e => eventStore.add(e),
      complete: () => setFollowSetLoaded(true),
    })

    return () => subscription.unsubscribe()
  }, [pubkey, eventStore, pool, relaysWithMetadata])

  // Also load kind 3 for migration detection
  useEffect(() => {
    if (!pubkey || eventStore.hasReplaceable(kinds.Contacts, pubkey)) return

    const loader = createAddressLoader(pool, { bufferTime: 0 })
    const subscription = loader({
      kind: kinds.Contacts,
      pubkey,
      relays: relaysWithMetadata,
    }).subscribe(e => eventStore.add(e))

    return () => subscription.unsubscribe()
  }, [pubkey, eventStore, pool, relaysWithMetadata])

  useEffect(() => {
    if (!pubkey) {
      setFollowSetEvent(null)
      return
    }

    const sub = eventStore
      .replaceable(MEDIA_FOLLOWS_KIND, pubkey)
      .subscribe(event => setFollowSetEvent(event ?? null))

    return () => sub.unsubscribe()
  }, [pubkey, eventStore])

  useEffect(() => {
    if (!pubkey) {
      setKind3Event(null)
      return
    }

    const sub = eventStore
      .replaceable(kinds.Contacts, pubkey)
      .subscribe(event => setKind3Event(event ?? null))

    return () => sub.unsubscribe()
  }, [pubkey, eventStore])

  const followedPubkeys = useMemo(() => {
    if (!followSetEvent) return EMPTY
    return followSetEvent.tags.filter(tag => tag[0] === 'p' && tag[1]).map(tag => tag[1])
  }, [followSetEvent])

  // Seeded synchronously so the very first render can already build the feed
  // filter instead of waiting a relay round-trip for the follow set.
  const [cachedPubkeys, setCachedPubkeys] = useState<string[]>(() =>
    pubkey ? readCache(pubkey) : EMPTY
  )

  useEffect(() => {
    setCachedPubkeys(pubkey ? readCache(pubkey) : EMPTY)
  }, [pubkey])

  useEffect(() => {
    if (!pubkey || !followSetEvent) return
    writeCache(pubkey, followedPubkeys)
  }, [pubkey, followSetEvent, followedPubkeys])

  const value = useMemo<FollowSetContextValue>(
    () => ({
      followSetEvent,
      kind3Event,
      followSetLoaded,
      followedPubkeys,
      optimisticFollowedPubkeys: followSetEvent ? followedPubkeys : cachedPubkeys,
    }),
    [followSetEvent, kind3Event, followSetLoaded, followedPubkeys, cachedPubkeys]
  )

  return <FollowSetContext.Provider value={value}>{children}</FollowSetContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFollowSetContext(): FollowSetContextValue {
  return useContext(FollowSetContext)
}

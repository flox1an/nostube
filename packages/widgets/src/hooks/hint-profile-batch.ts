import { kinds } from 'nostr-tools'
import type { RelayPool } from 'applesauce-relay'
import { loadFromRelays } from '@nostube/core/relay-load'
import { allowProfileRequest, pruneProfileRequests } from './profile-request-memo'

/** What the model's store view gives us: the loader's store plus an optional dedupe check. */
type HintStore = NonNullable<NonNullable<Parameters<typeof loadFromRelays>[3]>['eventStore']> & {
  hasReplaceable?(kind: number, pubkey: string): boolean | Promise<boolean>
}

/**
 * Batches the per-card profile lookups that go to a video's relay hints.
 *
 * Every card mount used to fire its own request (a REQ per hint relay), and a
 * remount fired it again for an author already asked for. Cards sharing a relay
 * set now share one request per batch window, and {@link allowProfileRequest}
 * keeps a remount from repeating it.
 *
 * `limit` is exact on purpose: a profile is one event per author.
 */
export const HINT_BATCH_MS = 100

interface HintBatch {
  pool: RelayPool
  store: HintStore
  relays: string[]
  pubkeys: Set<string>
}

const pending = new Map<string, HintBatch>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

/** Exported for tests; production flushes on the batch timer. */
export function flushHintProfiles() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const batches = [...pending.values()]
  pending.clear()
  pruneProfileRequests()

  for (const { pool, store, relays, pubkeys } of batches) {
    const authors = [...pubkeys].filter(
      pubkey => store.hasReplaceable?.(kinds.Metadata, pubkey) !== true
    )
    if (authors.length === 0) continue

    loadFromRelays(
      pool,
      relays,
      { kinds: [kinds.Metadata], authors },
      { eventStore: store, limit: authors.length }
    ).subscribe({
      error: err => console.error('[Profile Loader] Error loading profile from hint relays:', err),
    })
  }
}

export function requestHintProfile(
  pool: RelayPool,
  store: HintStore,
  relays: string[],
  pubkey: string
) {
  if (relays.length === 0) return
  if (store.hasReplaceable?.(kinds.Metadata, pubkey) === true) return

  const key = [...relays].sort().join(',')
  const batch = pending.get(key)
  if (batch?.pubkeys.has(pubkey)) return
  if (!allowProfileRequest(key, pubkey)) return

  if (batch) {
    batch.pubkeys.add(pubkey)
  } else {
    pending.set(key, { pool, store, relays, pubkeys: new Set([pubkey]) })
    if (!flushTimer) flushTimer = setTimeout(flushHintProfiles, HINT_BATCH_MS)
  }
}

/** Clears pending requests (tests, and a hard client reset). */
export function resetHintProfiles() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pending.clear()
}

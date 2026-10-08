/**
 * Validate a batch of NIP-51 playlist events against the active NSFW/blocked/
 * reported sources BEFORE the UI shows them.
 *
 * Verdict per playlist (`Map<eventId, ValidationStatus>`):
 * - `clean`   — all referenced videos were resolvable and none flagged unsafe
 * - `unsafe`  — at least one referenced video is definitively unsafe
 * - `pending` — at least one reference still has to be fetched from relays
 *
 * Verdicts are persisted to IndexedDB ({@link playlist-validation-db}) keyed
 * by the playlist's replaceable address (`kind:pubkey:dtag`) and pinned to the
 * concrete event id, so each republish triggers a fresh validation.
 *
 * Consumers (global / author playlists hooks) hide everything that isn't
 * `clean` when the user's NSFW filter is `hide`. The hook is a no-op (returns
 * `clean` for every event id) when `enabled` is `false`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader, createAddressLoader } from 'applesauce-loaders/loaders'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import type { Event as NostrEvent } from 'nostr-tools'

import {
  evaluatePlaylistRefs,
  type PlaylistEvaluation,
  type UnsafeContentSources,
  type VideoEventResolver,
} from '@/lib/playlist-content-warning'
import {
  getCachedBatch,
  setCached,
  type CachedValidation,
  type PlaylistValidationStatus,
} from '@/lib/playlist-validation-db'
import type { Video } from './usePlaylist'
import { useAppContext } from './useAppContext'

export type ValidationStatus = PlaylistValidationStatus | 'pending'

export interface UsePlaylistValidationOptions {
  /** When `false` every event id is reported as `clean` (filter is off). */
  enabled: boolean
  sources: UnsafeContentSources
  /** Relays to load missing referenced video events from. */
  relays: string[]
  /** Decrypted or otherwise locally resolved video refs keyed by playlist event id. */
  videosByEventId?: ReadonlyMap<string, readonly Video[]>
  /** Maximum wait for relay loads before pending playlists stay hidden. */
  loadTimeoutMs?: number
}

const HEX64 = /^[0-9a-f]{64}$/i

/** Parse `e`- and `a`-tags from a playlist event into validator-friendly refs. */
function parsePlaylistVideos(event: NostrEvent): Video[] {
  const videos: Video[] = []
  for (const t of event.tags) {
    if (t[0] === 'e') {
      let pubkey: string | undefined
      for (let i = 3; i < t.length; i++) {
        if (typeof t[i] === 'string' && HEX64.test(t[i])) {
          pubkey = t[i]
          break
        }
      }
      videos.push({
        id: t[1],
        kind: 0,
        added_at: event.created_at,
        relayHint: t[2],
        pubkey,
      })
    } else if (t[0] === 'a') {
      const parts = t[1]?.split(':')
      if (parts && parts.length >= 3) {
        const kind = Number.parseInt(parts[0] ?? '', 10)
        if (Number.isNaN(kind)) continue
        const pubkey = parts[1]
        const identifier = parts.slice(2).join(':')
        videos.push({
          id: `${kind}:${pubkey}:${identifier}`,
          kind,
          added_at: event.created_at,
          relayHint: t[2],
          pubkey,
          address: t[1],
        })
      }
    }
  }
  return videos
}

/** Extract the playlist's replaceable address (or `null` for non-addressable). */
function playlistAddress(event: NostrEvent): string | null {
  const d = event.tags.find(t => t[0] === 'd')?.[1]
  if (!d) return null
  return `${event.kind}:${event.pubkey}:${d}`
}

interface PlaylistMeta {
  event: NostrEvent
  address: string
  videos: Video[]
}

function buildPlaylistMeta(
  events: readonly NostrEvent[],
  videosByEventId?: ReadonlyMap<string, readonly Video[]>
): PlaylistMeta[] {
  const out: PlaylistMeta[] = []
  for (const event of events) {
    const address = playlistAddress(event)
    if (!address) continue
    out.push({
      event,
      address,
      videos: [...(videosByEventId?.get(event.id) ?? parsePlaylistVideos(event))],
    })
  }
  return out
}

interface MissingEventRef {
  id: string
  relayHint?: string
}

interface MissingAddressRef {
  address: string
  pointer: { kind: number; pubkey: string; identifier: string }
  relayHint?: string
}

interface PersistedVerdict {
  address: string
  eventId: string
  status: PlaylistValidationStatus
}

interface Subscription {
  unsubscribe(): void
}

/**
 * Verify-before-show validator. See module-level doc for verdict semantics.
 *
 * Implementation outline:
 * 1. Synchronously evaluate every playlist against the live `EventStore`. If
 *    we already know enough to decide (e.g. a referenced address pubkey is in
 *    `nsfwPubkeys`), we never need to hit the network.
 * 2. Hydrate verdicts from IndexedDB (`(address, eventId)` match) for every
 *    playlist still undecided.
 * 3. Fan out batched relay loads for the union of unresolved refs across all
 *    pending playlists.
 * 4. As events arrive, re-run sync evaluation for the playlists that referenced
 *    them; persist `clean`/`unsafe` to IDB. A global timeout tears down loaders
 *    so pending playlists don't churn network resources forever.
 */
export function usePlaylistValidation(
  events: readonly NostrEvent[],
  options: UsePlaylistValidationOptions
): Map<string, ValidationStatus> {
  const { enabled, sources, relays, videosByEventId, loadTimeoutMs = 15000 } = options
  const eventStore = useEventStore()
  const { pool } = useAppContext()

  const meta = useMemo(() => buildPlaylistMeta(events, videosByEventId), [events, videosByEventId])
  // sources is captured by ref so transient identity changes (e.g. a new
  // array literal each render for `reportedEventIds`) don't restart the
  // pipeline. New playlist arrivals or relay changes do.
  const sourcesRef = useRef<UnsafeContentSources>(sources)
  sourcesRef.current = sources

  const [statuses, setStatuses] = useState<Map<string, ValidationStatus>>(() => new Map())

  // No-op fast path: when validation is off, mark everything `clean` so
  // consumers can treat the verdict map uniformly.
  useEffect(() => {
    if (enabled) return
    setStatuses(prev => {
      if (prev.size === 0 && meta.length === 0) return prev
      const next = new Map<string, ValidationStatus>()
      for (const m of meta) next.set(m.event.id, 'clean')
      return next
    })
  }, [enabled, meta])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const subscriptions: Subscription[] = []
    let timeoutId: number | null = null

    // event.id of every playlist still waiting on a verdict. We delete entries
    // as they decide (clean/unsafe) so re-evaluation passes only walk what's
    // still in flight.
    const pending = new Map<string, PlaylistMeta>()
    for (const m of meta) pending.set(m.event.id, m)

    const apply = (updates: Array<[string, ValidationStatus]>) => {
      if (updates.length === 0 || cancelled) return
      setStatuses(prev => {
        let changed = false
        const next = new Map(prev)
        for (const [eventId, status] of updates) {
          if (next.get(eventId) !== status) {
            next.set(eventId, status)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }

    // Seed with `pending` so consumers always see a fresh row per playlist.
    apply(meta.map<[string, ValidationStatus]>(m => [m.event.id, 'pending']))

    // Pass 1: synchronous evaluation against the current EventStore.
    const initialEvaluations = new Map<string, PlaylistEvaluation>()
    const syncUpdates: Array<[string, ValidationStatus]> = []
    const syncPersists: PersistedVerdict[] = []
    const resolver = eventStore as unknown as VideoEventResolver

    for (const m of meta) {
      const evaluation = evaluatePlaylistRefs(m.videos, resolver, sourcesRef.current)
      initialEvaluations.set(m.event.id, evaluation)
      if (evaluation.hasUnsafe) {
        syncUpdates.push([m.event.id, 'unsafe'])
        syncPersists.push({ address: m.address, eventId: m.event.id, status: 'unsafe' })
        pending.delete(m.event.id)
      } else if (evaluation.unresolved.length === 0) {
        syncUpdates.push([m.event.id, 'clean'])
        syncPersists.push({ address: m.address, eventId: m.event.id, status: 'clean' })
        pending.delete(m.event.id)
      }
    }
    apply(syncUpdates)
    if (syncPersists.length > 0) void setCached(syncPersists)

    // Pass 2 + 3: hydrate from cache, then fan out network loads.
    void (async () => {
      if (cancelled || pending.size === 0) return

      const cacheLookup: Array<{ address: string; eventId: string }> = []
      for (const m of pending.values()) {
        cacheLookup.push({ address: m.address, eventId: m.event.id })
      }
      const cached = await getCachedBatch(cacheLookup)
      if (cancelled) return

      const cacheUpdates: Array<[string, ValidationStatus]> = []
      for (const [, m] of [...pending]) {
        const hit: CachedValidation | undefined = cached.get(m.address)
        if (!hit) continue
        cacheUpdates.push([m.event.id, hit.status])
        pending.delete(m.event.id)
      }
      apply(cacheUpdates)

      if (cancelled || pending.size === 0) return

      // Build the load batch + reverse index (ref id/address → playlist ids).
      const missingEvents = new Map<string, MissingEventRef>()
      const missingAddresses = new Map<string, MissingAddressRef>()
      const playlistsByRef = new Map<string, Set<string>>()
      for (const m of pending.values()) {
        const evaluation = initialEvaluations.get(m.event.id)
        if (!evaluation) continue
        for (const ref of evaluation.unresolved) {
          let watchers = playlistsByRef.get(ref.id)
          if (!watchers) {
            watchers = new Set()
            playlistsByRef.set(ref.id, watchers)
          }
          watchers.add(m.event.id)

          if (ref.isAddress && ref.address) {
            if (!missingAddresses.has(ref.id)) {
              missingAddresses.set(ref.id, {
                address: ref.id,
                pointer: ref.address,
                relayHint: ref.relayHint,
              })
            }
          } else if (!ref.isAddress) {
            if (!missingEvents.has(ref.id)) {
              missingEvents.set(ref.id, { id: ref.id, relayHint: ref.relayHint })
            }
          }
        }
      }

      const reEvaluate = (touched: Iterable<string>) => {
        if (cancelled) return
        const updates: Array<[string, ValidationStatus]> = []
        const persists: PersistedVerdict[] = []
        for (const id of touched) {
          const m = pending.get(id)
          if (!m) continue
          const evaluation = evaluatePlaylistRefs(m.videos, resolver, sourcesRef.current)
          if (evaluation.hasUnsafe) {
            updates.push([id, 'unsafe'])
            persists.push({ address: m.address, eventId: m.event.id, status: 'unsafe' })
            pending.delete(id)
          } else if (evaluation.unresolved.length === 0) {
            updates.push([id, 'clean'])
            persists.push({ address: m.address, eventId: m.event.id, status: 'clean' })
            pending.delete(id)
          }
        }
        apply(updates)
        if (persists.length > 0) void setCached(persists)
      }

      const onArrival = (event: NostrEvent) => {
        const touched = new Set<string>()
        const byId = playlistsByRef.get(event.id)
        if (byId) for (const id of byId) touched.add(id)
        const d = event.tags.find(t => t[0] === 'd')?.[1]
        if (d) {
          const byAddr = playlistsByRef.get(`${event.kind}:${event.pubkey}:${d}`)
          if (byAddr) for (const id of byAddr) touched.add(id)
        }
        if (touched.size > 0) reEvaluate(touched)
      }

      if (missingEvents.size > 0) {
        const ids = [...missingEvents.keys()]
        const eventRelays = collectRelayHints(missingEvents.values(), relays, eventStore)
        const loader = createTimelineLoader(pool, eventRelays, { ids }, { eventStore })
        if (cancelled) return
        subscriptions.push(
          loader().subscribe({
            next: event => {
              if (cancelled) return
              eventStore.add(event)
              onArrival(event)
            },
            error: err => console.warn('[usePlaylistValidation] event load failed:', err),
          })
        )
      }

      if (missingAddresses.size > 0) {
        const addressLoader = createAddressLoader(pool, { eventStore, extraRelays: relays })
        for (const ref of missingAddresses.values()) {
          if (cancelled) return
          subscriptions.push(
            addressLoader(ref.pointer).subscribe({
              next: event => {
                if (cancelled || !event) return
                eventStore.add(event)
                onArrival(event)
              },
              error: err => console.warn('[usePlaylistValidation] address load failed:', err),
            })
          )
        }
      }

      // Tear down loaders after the timeout — anything still pending stays
      // hidden and will be retried on next session (no cache poisoning).
      timeoutId = window.setTimeout(() => {
        for (const sub of subscriptions) sub.unsubscribe()
        subscriptions.length = 0
      }, loadTimeoutMs)
    })()

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      for (const sub of subscriptions) sub.unsubscribe()
    }
  }, [meta, enabled, eventStore, pool, relays, loadTimeoutMs])

  return statuses
}

/**
 * Pull relay hints from each missing event ref plus the playlist relay list.
 * Falls back to the supplied `relays` when no hints exist.
 */
function collectRelayHints(
  missing: Iterable<MissingEventRef>,
  fallback: string[],
  eventStore: { getEvent(id: string): NostrEvent | undefined }
): string[] {
  const set = new Set<string>(fallback)
  for (const m of missing) {
    if (m.relayHint) set.add(m.relayHint)
    const existing = eventStore.getEvent(m.id)
    if (existing) {
      const seen = getSeenRelays(existing)
      if (seen) for (const url of seen) set.add(url)
    }
  }
  return [...set]
}

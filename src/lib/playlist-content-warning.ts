import type { Event as NostrEvent } from 'nostr-tools'

import type { Video } from '@/hooks/usePlaylist'

/**
 * Sources that define which videos should be considered unsafe (NSFW or blocked).
 *
 * All fields accept either an array or a `Set`. Empty/undefined inputs are
 * cheap no-ops; the helper does not allocate when there is nothing to check.
 */
export interface UnsafeContentSources {
  /** Authors marked as NSFW in the active preset. */
  nsfwPubkeys?: readonly string[] | Set<string>
  /** Authors blocked in the active preset. */
  blockedPubkeys?: readonly string[] | Set<string>
  /** Event IDs blocked in the active preset. */
  blockedEvents?: readonly string[] | Set<string>
  /** Event IDs the local user has reported. */
  reportedEventIds?: readonly string[] | Set<string>
}

/**
 * Minimal slice of the applesauce `EventStore` used to look up referenced
 * video events. Decoupled from the concrete class so tests can stub it.
 */
export interface VideoEventResolver {
  getEvent(id: string): NostrEvent | undefined
  getReplaceable(kind: number, pubkey: string, identifier: string): NostrEvent | undefined
}

const EMPTY_SET: Set<string> = new Set()

function toSet(values?: readonly string[] | Set<string>): Set<string> {
  if (!values) return EMPTY_SET
  if (values instanceof Set) return values
  if (values.length === 0) return EMPTY_SET
  return new Set(values)
}

/**
 * Returns true when any video referenced by the playlist is NSFW or otherwise
 * blocked according to the provided sources and what we can resolve from `store`.
 *
 * - Address (`a`-tag) refs encode the author pubkey directly, so NSFW/blocked
 *   authors are caught even when the video event itself isn't in the store.
 * - Event (`e`-tag) refs only resolve when the event is loaded; unresolved
 *   events are treated as "not unsafe" until they arrive (the caller is
 *   expected to re-check when new events are inserted).
 */
export function playlistHasUnsafeVideo(
  videos: readonly Video[],
  store: VideoEventResolver,
  sources: UnsafeContentSources
): boolean {
  if (videos.length === 0) return false

  const nsfwPubkeys = toSet(sources.nsfwPubkeys)
  const blockedPubkeys = toSet(sources.blockedPubkeys)
  const blockedEvents = toSet(sources.blockedEvents)
  const reportedEvents = toSet(sources.reportedEventIds)

  for (const video of videos) {
    if (reportedEvents.has(video.id) || blockedEvents.has(video.id)) return true

    // Free check: any pubkey we already know (a-tag address or e-tag author
    // hint) lets us decide without resolving the event.
    if (video.pubkey && (nsfwPubkeys.has(video.pubkey) || blockedPubkeys.has(video.pubkey))) {
      return true
    }

    if (video.address) {
      const [kindStr, addrPubkey, ...idParts] = video.address.split(':')
      const kind = Number.parseInt(kindStr ?? '', 10)
      if (!Number.isNaN(kind) && addrPubkey) {
        const event = store.getReplaceable(kind, addrPubkey, idParts.join(':'))
        if (
          event &&
          (nsfwPubkeys.has(event.pubkey) ||
            blockedPubkeys.has(event.pubkey) ||
            event.tags.some(tag => tag[0] === 'content-warning'))
        ) {
          return true
        }
      }
      continue
    }

    const event = store.getEvent(video.id)
    if (
      event &&
      (nsfwPubkeys.has(event.pubkey) ||
        blockedPubkeys.has(event.pubkey) ||
        event.tags.some(tag => tag[0] === 'content-warning'))
    ) {
      return true
    }
  }

  return false
}

/**
 * A video reference that we couldn't resolve to a concrete event in `store`.
 * Used by callers (e.g. the playlist-validation hook) to load it from relays
 * and re-evaluate.
 */
export interface UnresolvedPlaylistRef {
  /** Event id (for `e`-tag refs) or address string (`kind:pubkey:dtag` for `a`-tag refs). */
  id: string
  /** When true `id` is an address pointer (`kind:pubkey:dtag`). */
  isAddress: boolean
  /** Decoded address pointer when `isAddress` is true. */
  address?: { kind: number; pubkey: string; identifier: string }
  /** Relay hint carried on the playlist's tag, when present. */
  relayHint?: string
}

/** Outcome of a playlist evaluation pass. */
export interface PlaylistEvaluation {
  /**
   * `true` when at least one referenced video is definitely unsafe given the
   * current sources and what could be resolved from `store`. Once `true`, the
   * playlist's verdict is final regardless of any unresolved refs.
   */
  hasUnsafe: boolean
  /**
   * Refs that could not be resolved from `store`. When `hasUnsafe` is `false`
   * but this list is non-empty the playlist's verdict is `pending` — callers
   * must resolve these refs and re-evaluate before declaring the playlist
   * clean.
   */
  unresolved: UnresolvedPlaylistRef[]
}

/**
 * Evaluate a playlist's video references for content-warning / NSFW / blocked /
 * reported signals AND collect refs that could not be resolved from `store`.
 *
 * Unlike {@link playlistHasUnsafeVideo}, which returns `false` for unresolved
 * refs, this surfaces the unresolved set so callers can fetch the missing
 * events and re-evaluate. That distinction is essential for "verify before
 * showing" semantics: an unresolved ref means the playlist's safety is
 * **unknown**, not safe.
 */
export function evaluatePlaylistRefs(
  videos: readonly Video[],
  store: VideoEventResolver,
  sources: UnsafeContentSources
): PlaylistEvaluation {
  if (videos.length === 0) return { hasUnsafe: false, unresolved: [] }

  const nsfwPubkeys = toSet(sources.nsfwPubkeys)
  const blockedPubkeys = toSet(sources.blockedPubkeys)
  const blockedEvents = toSet(sources.blockedEvents)
  const reportedEvents = toSet(sources.reportedEventIds)

  const unresolved: UnresolvedPlaylistRef[] = []

  for (const video of videos) {
    if (reportedEvents.has(video.id) || blockedEvents.has(video.id)) {
      return { hasUnsafe: true, unresolved: [] }
    }

    if (video.pubkey && (nsfwPubkeys.has(video.pubkey) || blockedPubkeys.has(video.pubkey))) {
      return { hasUnsafe: true, unresolved: [] }
    }

    if (video.address) {
      const [kindStr, addrPubkey, ...idParts] = video.address.split(':')
      const kind = Number.parseInt(kindStr ?? '', 10)
      if (Number.isNaN(kind) || !addrPubkey) continue
      const identifier = idParts.join(':')
      const event = store.getReplaceable(kind, addrPubkey, identifier)
      if (event) {
        if (
          nsfwPubkeys.has(event.pubkey) ||
          blockedPubkeys.has(event.pubkey) ||
          event.tags.some(tag => tag[0] === 'content-warning')
        ) {
          return { hasUnsafe: true, unresolved: [] }
        }
        continue
      }
      unresolved.push({
        id: video.address,
        isAddress: true,
        address: { kind, pubkey: addrPubkey, identifier },
        relayHint: video.relayHint,
      })
      continue
    }

    const event = store.getEvent(video.id)
    if (event) {
      if (
        nsfwPubkeys.has(event.pubkey) ||
        blockedPubkeys.has(event.pubkey) ||
        event.tags.some(tag => tag[0] === 'content-warning')
      ) {
        return { hasUnsafe: true, unresolved: [] }
      }
      continue
    }
    unresolved.push({ id: video.id, isAddress: false, relayHint: video.relayHint })
  }

  return { hasUnsafe: false, unresolved }
}

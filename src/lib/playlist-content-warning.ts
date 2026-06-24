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

    if (video.address) {
      const [kindStr, addrPubkey, ...idParts] = video.address.split(':')
      if (addrPubkey && (nsfwPubkeys.has(addrPubkey) || blockedPubkeys.has(addrPubkey))) {
        return true
      }
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

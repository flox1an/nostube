import type { NostrEvent } from 'nostr-tools'
import type { RelayPool } from 'applesauce-relay'
import { lastValueFrom, toArray } from 'rxjs'

/** Event IDs need resolving to determine whether they refer to a video. */
export interface PinRef {
  id?: string
  address?: string
}

export function parsePinRefs(tags: string[][]): PinRef[] {
  return tags.flatMap((tag): PinRef[] => {
    if (tag[0] === 'e' && tag[1]) return [{ id: tag[1] }]
    if (tag[0] === 'a' && /^(34235|34236):/.test(tag[1] ?? '')) return [{ address: tag[1] }]
    return []
  })
}

/** NIP-01: newest timestamp wins; equal timestamps use the lowest event ID. */
export function newestPinList(events: NostrEvent[]): NostrEvent | undefined {
  return events.reduce<NostrEvent | undefined>(
    (latest, event) =>
      !latest ||
      event.created_at > latest.created_at ||
      (event.created_at === latest.created_at && event.id < latest.id)
        ? event
        : latest,
    undefined
  )
}

export async function loadPinList(pool: RelayPool, relays: string[], pubkey: string) {
  const events = await lastValueFrom(
    pool.request(relays, [{ kinds: [10001], authors: [pubkey], limit: 1 }]).pipe(toArray())
  )
  return newestPinList(events)
}

/** Replace only resolved video pins being edited; retain notes, unknown pins and metadata. */
export function replaceVideoPins(
  tags: string[][],
  controlledRefs: string[],
  refs: string[],
  relay: string
): string[][] {
  const controlled = new Set(controlledRefs)
  return [
    ...tags.filter(tag => !(['a', 'e'].includes(tag[0]) && controlled.has(tag[1]))),
    ...[...new Set(refs)].map(ref => [ref.includes(':') ? 'a' : 'e', ref, relay]),
  ]
}

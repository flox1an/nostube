/**
 * NIP-51 mute lists (kind 10000): reading the public entries, editing one entry, and the
 * filter the site applies to comments. Only the public `p` (author) and `e` (event) tags are
 * read or edited; the encrypted private part (`content`) and every other tag stay as they are.
 */
import type { EventTemplate, NostrEvent } from 'nostr-tools'

export const MUTE_LIST_KIND = 10000

/** What a mute list event needs to be read and edited. */
export type MuteListEvent = Pick<NostrEvent, 'created_at' | 'tags' | 'content'>

export interface Muted {
  pubkeys: ReadonlySet<string>
  events: ReadonlySet<string>
}

/** The public authors and events of the given lists; several lists apply as their union. */
export function mutedOf(lists: readonly Pick<NostrEvent, 'tags'>[]): Muted {
  const pubkeys = new Set<string>()
  const events = new Set<string>()
  for (const list of lists) {
    for (const [name, value] of list.tags) {
      if (!value) continue
      if (name === 'p') pubkeys.add(value)
      else if (name === 'e') events.add(value)
    }
  }
  return { pubkeys, events }
}

/** True when the comment's author or the comment itself is muted. */
export const isMuted = (comment: { id: string; pubkey: string }, muted: Muted) =>
  muted.pubkeys.has(comment.pubkey) || muted.events.has(comment.id)

/**
 * The next version of a list with one public entry added or removed. Kind 10000 is replaceable:
 * whatever the new event leaves out is gone, so it starts from the current list (null: none
 * yet) and keeps its other tags and its content. `created_at` lands above the current one, or
 * relays would keep the old version.
 */
function edit(
  list: MuteListEvent | null,
  name: 'p' | 'e',
  value: string,
  add: boolean,
  now: number
): EventTemplate {
  const current = list?.tags ?? []
  const matches = (tag: string[]) => tag[0] === name && tag[1] === value
  // An entry that is already there keeps its place and its extra fields (relay hints).
  const tags = add
    ? current.some(matches)
      ? current
      : [...current, [name, value]]
    : current.filter(tag => !matches(tag))
  return {
    kind: MUTE_LIST_KIND,
    created_at: Math.max(now, (list?.created_at ?? 0) + 1),
    tags: tags.map(tag => [...tag]),
    content: list?.content ?? '',
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

export const muteAuthor = (list: MuteListEvent | null, pubkey: string, now = nowSeconds()) =>
  edit(list, 'p', pubkey, true, now)
export const unmuteAuthor = (list: MuteListEvent | null, pubkey: string, now = nowSeconds()) =>
  edit(list, 'p', pubkey, false, now)
export const muteEvent = (list: MuteListEvent | null, id: string, now = nowSeconds()) =>
  edit(list, 'e', id, true, now)
export const unmuteEvent = (list: MuteListEvent | null, id: string, now = nowSeconds()) =>
  edit(list, 'e', id, false, now)

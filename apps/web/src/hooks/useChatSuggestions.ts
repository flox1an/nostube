import { useEffect, useState } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { getDisplayName, getProfileContent } from 'applesauce-core/helpers/profile'
import type { ComposeTrigger, CustomEmoji } from '@nostube/core/chat-compose'
import {
  loadUnicodeEmojis,
  matchRank,
  searchUnicodeEmojis,
  type UnicodeEmoji,
} from '@nostube/core/emoji-search'
import { genUserName } from '@nostube/core/gen-user-name'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useSearchProfiles } from '@/hooks/useSearchProfiles'

export type Suggestion =
  | { type: 'person'; pubkey: string; name: string; picture?: string; nip05?: string }
  | { type: 'custom'; emoji: CustomEmoji; source: 'channel' | 'mine' }
  | { type: 'unicode'; emoji: UnicodeEmoji }

const LIMIT = 8

/**
 * What the chat composer offers for the trigger at the caret. `@`: the streamer and recent
 * chatters at once, matching follows, then people search results. `:`: channel emotes, then
 * the viewer's own, then Unicode emoji by name.
 */
export function useChatSuggestions(
  trigger: ComposeTrigger | null,
  {
    hostPubkey,
    selfPubkey,
    participants,
    hidden,
    channel,
    mine,
  }: {
    hostPubkey: string
    selfPubkey: string
    /** Recent chatters, newest first. */
    participants: readonly string[]
    /** Muted and blocked accounts: never suggested. */
    hidden: ReadonlySet<string>
    channel: readonly CustomEmoji[]
    mine: readonly CustomEmoji[]
  }
): Suggestion[] {
  const eventStore = useEventStore()
  const { followedPubkeys } = useFollowSet()
  const { profiles: found } = useSearchProfiles({
    query: trigger?.kind === '@' ? trigger.query : '',
    limit: LIMIT,
  })
  const [unicode, setUnicode] = useState<UnicodeEmoji[]>([])
  const wantsEmoji = trigger?.kind === ':'
  // Fails quietly: custom emotes still work, and the next `:` asks again.
  useEffect(() => {
    if (wantsEmoji && unicode.length === 0) loadUnicodeEmojis().then(setUnicode, () => {})
  }, [wantsEmoji, unicode.length])

  if (!trigger) return []
  const query = trigger.query

  if (trigger.kind === ':') {
    const seen = new Set<string>()
    const custom = [
      ...channel.map(emoji => ({ type: 'custom' as const, emoji, source: 'channel' as const })),
      ...mine.map(emoji => ({ type: 'custom' as const, emoji, source: 'mine' as const })),
    ]
      .filter(item => !seen.has(item.emoji.shortcode) && seen.add(item.emoji.shortcode))
      .map(item => ({ item, rank: matchRank(query, [item.emoji.shortcode]) }))
      .filter(hit => hit.rank !== null)
      .sort(
        (a, b) => a.rank! - b.rank! || a.item.emoji.shortcode.length - b.item.emoji.shortcode.length
      )
      .slice(0, LIMIT)
      .map(hit => hit.item)
    const named = searchUnicodeEmojis(unicode, query, LIMIT - custom.length)
    return [...custom, ...named.map(emoji => ({ type: 'unicode' as const, emoji }))]
  }

  const known = new Set([hostPubkey, ...participants])
  const people: { item: Suggestion; rank: number }[] = []
  const taken = new Set([selfPubkey, ...hidden])
  for (const pubkey of [hostPubkey, ...participants, ...(query ? followedPubkeys : [])]) {
    if (taken.has(pubkey)) continue
    taken.add(pubkey)
    const event = eventStore.getReplaceable(0, pubkey)
    const profile = event ? getProfileContent(event) : undefined
    // A follow without a loaded profile has no name to match yet.
    if (!profile && !known.has(pubkey)) continue
    const name = getDisplayName(profile, genUserName(pubkey)).trim()
    const rank = query ? matchRank(query, [name, profile?.name ?? '', profile?.nip05 ?? '']) : 0
    if (rank === null) continue
    people.push({
      item: { type: 'person', pubkey, name, picture: profile?.picture, nip05: profile?.nip05 },
      rank,
    })
  }
  // Search results come after everyone here, best name match first.
  for (const { pubkey, profile } of found) {
    if (taken.has(pubkey)) continue
    taken.add(pubkey)
    const name = getDisplayName(profile, genUserName(pubkey)).trim()
    const rank = matchRank(query, [name, profile.name ?? '', profile.nip05 ?? ''])
    people.push({
      item: { type: 'person', pubkey, name, picture: profile.picture, nip05: profile.nip05 },
      rank: rank === null ? 9 : 5 + rank,
    })
  }
  return people
    .sort((a, b) => a.rank - b.rank)
    .slice(0, LIMIT)
    .map(hit => hit.item)
}

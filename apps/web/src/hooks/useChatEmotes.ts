import { use$, useEventStore } from 'applesauce-react/hooks'
import type { IEventStore } from 'applesauce-core'
import { getReplaceableAddressFromPointer } from 'applesauce-core/helpers/pointers'
import {
  FAVORITE_EMOJI_PACKS_KIND,
  getEmojiPackEmojis,
  getFavoriteEmojiPackPointers,
  getFavoriteEmojis,
} from 'applesauce-common/helpers/emoji-pack'
import { combineLatest, map, of, startWith, switchMap, type Observable } from 'rxjs'
import type { CustomEmoji } from '@nostube/core/chat-compose'
import { isAllowedEventMediaUrl } from '@nostube/core/media-url-policy'
import { METADATA_RELAYS } from '@/constants/relays'

/** A pubkey's NIP-51 emoji list (kind 10030): its own emoji, then those of the sets it names. */
function emojisOf(eventStore: IEventStore, pubkey: string): Observable<CustomEmoji[]> {
  // Lists like this one often live only on the profile indexers (purplepag.es).
  const pointer = { kind: FAVORITE_EMOJI_PACKS_KIND, pubkey, relays: METADATA_RELAYS }
  return eventStore.replaceable(pointer).pipe(
    switchMap(list => {
      if (!list) return of([])
      const direct = getFavoriteEmojis(list).map(({ shortcode, url, address }) => ({
        shortcode,
        url,
        address: address && getReplaceableAddressFromPointer(address),
      }))
      const packs = getFavoriteEmojiPackPointers(list).map(pointer =>
        eventStore.replaceable(pointer).pipe(
          map(pack => {
            const address = getReplaceableAddressFromPointer(pointer)
            return pack
              ? getEmojiPackEmojis(pack).map(({ shortcode, url }) => ({ shortcode, url, address }))
              : []
          }),
          startWith([])
        )
      )
      return (packs.length > 0 ? combineLatest(packs) : of([])).pipe(
        map(sets => {
          const seen = new Set<string>()
          return [...direct, ...sets.flat()].filter(emoji => {
            if (seen.has(emoji.shortcode) || !isAllowedEventMediaUrl(emoji.url)) return false
            seen.add(emoji.shortcode)
            return true
          })
        })
      )
    })
  )
}

const NONE: CustomEmoji[] = []

/**
 * Custom emoji for a live chat: the streamer's (channel emotes) and the viewer's own, both from
 * their kind 10030 lists. `mine` is empty when the viewer is the streamer.
 */
export function useChatEmotes(
  hostPubkey: string,
  userPubkey: string | undefined
): { channel: CustomEmoji[]; mine: CustomEmoji[] } {
  const eventStore = useEventStore()
  const channel = use$(() => emojisOf(eventStore, hostPubkey), [eventStore, hostPubkey])
  const mine = use$(
    () => (userPubkey && userPubkey !== hostPubkey ? emojisOf(eventStore, userPubkey) : of([])),
    [eventStore, userPubkey, hostPubkey]
  )
  return { channel: channel ?? NONE, mine: mine ?? NONE }
}

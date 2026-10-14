import type { EventPointer } from 'nostr-tools/nip19'
import { decodeNip19 } from '@nostube/core/nip19'
import { getTypeForKind } from '@nostube/core/video-types'
import { buildVideoPath } from '@/utils/video-utils'
import { buildProfilePath } from '@/lib/nprofile'

/** Where a `web+nostr:` link goes; `load` means the event kind is unknown until it is fetched. */
export type NostrHandlerRoute =
  | { type: 'navigate'; to: string }
  | { type: 'external'; url: string }
  | { type: 'load'; identifier: string; pointer: EventPointer }
  | { type: 'invalid' }

/** NIP-71 videos and shorts open here; every other kind opens on njump.me. */
export function routeForKind(identifier: string, kind: number | undefined): NostrHandlerRoute {
  const type = kind === undefined ? 'all' : getTypeForKind(kind)
  if (type === 'videos') return { type: 'navigate', to: buildVideoPath(identifier, 'video') }
  if (type === 'shorts') return { type: 'navigate', to: buildVideoPath(identifier, 'shorts') }
  return { type: 'external', url: `https://njump.me/${identifier}` }
}

/** Route a `web+nostr:<nip19>` URI (the registered handler scheme; `nostr:` or bare also work). */
export function routeNostrUri(uri: string): NostrHandlerRoute {
  const identifier = uri.trim().replace(/^(web\+)?nostr:/i, '')
  const decoded = identifier ? decodeNip19(identifier) : null
  if (!decoded) return { type: 'invalid' }

  switch (decoded.type) {
    case 'npub':
    case 'nprofile':
      return { type: 'navigate', to: buildProfilePath(identifier) }
    case 'naddr':
      return routeForKind(identifier, decoded.data.kind)
    case 'nevent':
      return decoded.data.kind === undefined
        ? { type: 'load', identifier, pointer: decoded.data }
        : routeForKind(identifier, decoded.data.kind)
    case 'note':
      return { type: 'load', identifier, pointer: { id: decoded.data } }
    default:
      // nsec: a secret key is never forwarded anywhere.
      return { type: 'invalid' }
  }
}

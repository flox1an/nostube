import { decodeNip19 } from './nip19'
import { isHiddenVideoRef } from './instance-config'

/**
 * Turns what a creator pastes into the stored form of a hidden video: `<kind>:<pubkey>:<d>` for
 * addressable events, the event id otherwise. Accepts that stored form, a 64-hex id, an
 * naddr/nevent/note (with or without `nostr:`) and the URL of a video page (`…/v/<naddr>`).
 * Returns null for anything else.
 */
export function toHiddenVideoRef(input: string): string | null {
  let text = input.trim()
  const fromUrl = text.match(/\/v\/([0-9a-z]+)(?:[/?#].*)?$/)
  if (fromUrl) text = fromUrl[1]
  text = text.replace(/^nostr:/, '')
  if (isHiddenVideoRef(text)) return text
  const decoded = decodeNip19(text)
  if (!decoded) return null
  if (decoded.type === 'naddr') {
    const { kind, pubkey, identifier } = decoded.data
    return identifier ? `${kind}:${pubkey}:${identifier}` : null
  }
  if (decoded.type === 'nevent') return decoded.data.id
  if (decoded.type === 'note') return decoded.data
  return null
}

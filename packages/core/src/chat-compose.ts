import { nip19 } from 'nostr-tools'

/** The `@name` or `:shortcode` word at the caret: what to suggest and which text a pick replaces. */
export interface ComposeTrigger {
  kind: '@' | ':'
  /** Typed after the trigger character. */
  query: string
  /** Index of the trigger character. */
  start: number
}

/** A NIP-30 custom emoji the composer may send. */
export interface CustomEmoji {
  shortcode: string
  url: string
  /** `30030:<pubkey>:<d>` of the emoji set it comes from. */
  address?: string
}

/** A person picked from the `@` suggestions, written as `@name` in the draft. */
export interface Mention {
  name: string
  pubkey: string
}

const WORD_CHAR = /[\p{L}\p{N}_.-]/u
const SHORTCODE = /^[A-Za-z0-9_-]+$/

/**
 * The trigger the caret is in: `@` or `:` at the start of a word, then the word up to the caret.
 * `:` needs two shortcode characters, so `10:30`, `:)` and URLs never open suggestions.
 */
export function findTrigger(text: string, caret: number): ComposeTrigger | null {
  let i = caret
  while (i > 0 && WORD_CHAR.test(text[i - 1])) i--
  const kind = text[i - 1]
  if (kind !== '@' && kind !== ':') return null
  const start = i - 1
  if (start > 0 && !/\s/.test(text[start - 1])) return null
  const query = text.slice(i, caret)
  if (kind === ':' && (query.length < 2 || !SHORTCODE.test(query))) return null
  return { kind, query, start }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Turns the draft into a kind 1311 content and tags: each picked `@name` still written as such
 * becomes `nostr:npub…` plus a `p` tag (NIP-27); each `:shortcode:` of a known custom emoji adds
 * its `emoji` tag (NIP-30). A name edited after the pick stays plain text.
 */
export function composeChatMessage(
  text: string,
  mentions: readonly Mention[],
  emojis: ReadonlyMap<string, CustomEmoji>
): { content: string; tags: string[][] } {
  let content = text
  const tags: string[][] = []
  // Longest first: "@Ann Lee" must not be taken as "@Ann".
  for (const { name, pubkey } of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    const pattern = new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=$|[\\s.,!?;:)'"])`, 'g')
    const next = content.replace(pattern, `$1nostr:${nip19.npubEncode(pubkey)}`)
    if (next !== content && !tags.some(tag => tag[1] === pubkey)) tags.push(['p', pubkey])
    content = next
  }
  const used = new Set<string>()
  // Lookahead keeps the closing colon free to open the next shortcode (`:a::b:`).
  for (const [, code] of content.matchAll(/:([A-Za-z0-9_-]+)(?=:)/g)) {
    const emoji = emojis.get(code)
    if (!emoji || used.has(code)) continue
    used.add(code)
    tags.push(['emoji', code, emoji.url, ...(emoji.address ? [emoji.address] : [])])
  }
  return { content, tags }
}

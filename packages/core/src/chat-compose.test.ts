import { describe, expect, it } from 'vitest'
import { nip19 } from 'nostr-tools'
import { composeChatMessage, findTrigger, type CustomEmoji } from './chat-compose'

const at = (text: string) => findTrigger(text, text.length)

describe('findTrigger', () => {
  it('opens on @ and on : with two shortcode characters at a word start', () => {
    expect(at('@')).toEqual({ kind: '@', query: '', start: 0 })
    expect(at('hi @Jü')).toEqual({ kind: '@', query: 'Jü', start: 3 })
    expect(at('gg :pe')).toEqual({ kind: ':', query: 'pe', start: 3 })
  })

  it('stays closed for times, emoticons, URLs, mail addresses and one-letter shortcodes', () => {
    for (const text of ['at 10:30', ':)', 'https://x.example', 'me@mail.example', 'ok :p', 'a@b']) {
      expect(at(text), text).toBeNull()
    }
  })

  it('reads the word up to the caret only', () => {
    expect(findTrigger('@flox rocks', 3)).toEqual({ kind: '@', query: 'fl', start: 0 })
    expect(findTrigger('@flox rocks', 8)).toBeNull()
  })
})

describe('composeChatMessage', () => {
  const ann = 'a'.repeat(64)
  const annLee = 'b'.repeat(64)
  const pepe: CustomEmoji = {
    shortcode: 'pepe',
    url: 'https://e.example/p.png',
    address: '30030:c:set',
  }
  const emojis = new Map([['pepe', pepe]])

  it('writes picked names as nostr: references with one p tag each', () => {
    const { content, tags } = composeChatMessage(
      '@Ann Lee and @Ann, @Ann again',
      [
        { name: 'Ann', pubkey: ann },
        { name: 'Ann Lee', pubkey: annLee },
      ],
      emojis
    )
    const npub = (hex: string) => `nostr:${nip19.npubEncode(hex)}`
    expect(content).toBe(`${npub(annLee)} and ${npub(ann)}, ${npub(ann)} again`)
    expect(tags).toEqual([
      ['p', annLee],
      ['p', ann],
    ])
  })

  it('leaves an edited name as text', () => {
    const result = composeChatMessage('@Annie', [{ name: 'Ann', pubkey: ann }], emojis)
    expect(result).toEqual({ content: '@Annie', tags: [] })
  })

  it('tags each known shortcode once, also when typed by hand', () => {
    const { tags } = composeChatMessage(':pepe::pepe: :unknown: 10:30', [], emojis)
    expect(tags).toEqual([['emoji', 'pepe', pepe.url, pepe.address]])
  })
})

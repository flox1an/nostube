import { describe, expect, it } from 'vitest'
import {
  isMuted,
  muteAuthor,
  muteEvent,
  mutedOf,
  unmuteAuthor,
  unmuteEvent,
  type MuteListEvent,
} from './mute-list'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const E = 'e'.repeat(64)

const list: MuteListEvent = {
  created_at: 2_000,
  content: 'nip44-encrypted-private-part',
  tags: [
    ['p', A, 'wss://hint.example'],
    ['t', 'spam'],
    ['word', 'scam'],
    ['e', E],
  ],
}

describe('mute list edits', () => {
  it('adds an author and keeps every other tag and the private content', () => {
    const next = muteAuthor(list, B, 1_000)
    expect(next.kind).toBe(10000)
    expect(next.content).toBe(list.content)
    expect(next.tags).toEqual([...list.tags, ['p', B]])
  })

  it('does not add an entry twice and keeps its relay hint', () => {
    expect(muteAuthor(list, A, 1_000).tags).toEqual(list.tags)
    expect(muteEvent(list, E, 1_000).tags).toEqual(list.tags)
  })

  it('removes only the targeted entry', () => {
    expect(unmuteAuthor(list, A, 1_000).tags).toEqual([
      ['t', 'spam'],
      ['word', 'scam'],
      ['e', E],
    ])
    expect(unmuteEvent(list, E, 1_000).tags).toEqual(list.tags.slice(0, 3))
    // An event id equal to a muted pubkey is a different entry.
    expect(unmuteEvent(list, A, 1_000).tags).toEqual(list.tags)
  })

  it('dates the new version after the current one, even with a clock behind it', () => {
    expect(muteAuthor(list, B, 1_000).created_at).toBe(2_001)
    expect(muteAuthor(list, B, 5_000).created_at).toBe(5_000)
  })

  it('starts a list when there is none', () => {
    expect(muteEvent(null, E, 1_000)).toEqual({
      kind: 10000,
      created_at: 1_000,
      tags: [['e', E]],
      content: '',
    })
  })
})

describe('mutedOf / isMuted', () => {
  it('applies the union of several lists, by author or by comment id', () => {
    const muted = mutedOf([list, { tags: [['p', B]] }])
    expect(isMuted({ id: 'x', pubkey: A }, muted)).toBe(true)
    expect(isMuted({ id: 'x', pubkey: B }, muted)).toBe(true)
    expect(isMuted({ id: E, pubkey: 'c'.repeat(64) }, muted)).toBe(true)
    expect(isMuted({ id: 'x', pubkey: 'c'.repeat(64) }, muted)).toBe(false)
  })
})

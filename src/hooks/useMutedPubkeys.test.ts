import { describe, expect, it } from 'vitest'
import { kinds, type NostrEvent } from 'nostr-tools'
import { resolveMutedPubkeys } from './useMutedPubkeys'

const ALICE = 'a'.repeat(64)
const BOB = 'b'.repeat(64)
const CAROL = 'c'.repeat(64)

function muteList(tags: string[][]): NostrEvent {
  return {
    id: '1'.repeat(64),
    pubkey: '2'.repeat(64),
    created_at: 1_700_000_000,
    kind: kinds.Mutelist,
    tags,
    content: '',
    sig: '3'.repeat(128),
  }
}

describe('resolveMutedPubkeys', () => {
  it('falls back to local mutes when no mute list has loaded, so signed-out mutes still hide content', () => {
    expect(resolveMutedPubkeys(undefined, [ALICE])).toEqual([ALICE])
  })

  it('reads muted pubkeys from the list and ignores muted threads, hashtags and words', () => {
    const event = muteList([
      ['p', ALICE],
      ['e', '4'.repeat(64)],
      ['t', 'spam'],
      ['word', 'crypto'],
      ['p', BOB],
    ])

    expect(resolveMutedPubkeys(event, [])).toEqual([ALICE, BOB])
  })

  it('keeps local mutes effective alongside the published list until they are migrated', () => {
    const event = muteList([['p', ALICE]])

    expect(resolveMutedPubkeys(event, [BOB, CAROL]).sort()).toEqual([ALICE, BOB, CAROL].sort())
  })

  it('does not repeat a pubkey that is both published and still in local storage', () => {
    const event = muteList([['p', ALICE]])

    expect(resolveMutedPubkeys(event, [ALICE])).toEqual([ALICE])
  })
})

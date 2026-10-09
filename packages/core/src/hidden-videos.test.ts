import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import { toHiddenVideoRef } from './hidden-videos'

const PK = 'c'.repeat(64)
const ID = 'e'.repeat(64)
const naddr = nip19.naddrEncode({ kind: 34235, pubkey: PK, identifier: 'intro' })

describe('toHiddenVideoRef', () => {
  it('keeps the stored forms', () => {
    expect(toHiddenVideoRef(`34235:${PK}:intro`)).toBe(`34235:${PK}:intro`)
    expect(toHiddenVideoRef(ID)).toBe(ID)
  })

  it('converts naddr, nevent and note', () => {
    expect(toHiddenVideoRef(naddr)).toBe(`34235:${PK}:intro`)
    expect(toHiddenVideoRef(`nostr:${naddr}`)).toBe(`34235:${PK}:intro`)
    expect(toHiddenVideoRef(nip19.neventEncode({ id: ID }))).toBe(ID)
    expect(toHiddenVideoRef(nip19.noteEncode(ID))).toBe(ID)
  })

  it('reads the link of a video page', () => {
    expect(toHiddenVideoRef(`https://site.example/v/${naddr}`)).toBe(`34235:${PK}:intro`)
    expect(toHiddenVideoRef(`  https://site.example/v/${naddr}?t=3  `)).toBe(`34235:${PK}:intro`)
  })

  it('rejects everything else', () => {
    for (const bad of ['', 'hello', 'https://site.example/', nip19.npubEncode(PK), '34235:abc:d']) {
      expect(toHiddenVideoRef(bad)).toBeNull()
    }
  })
})

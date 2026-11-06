import { describe, expect, it } from 'vitest'
import { finalizeEvent, generateSecretKey, nip19 } from 'nostr-tools'
import {
  decodeRelaySet,
  MAX_BROWSE_RELAYS,
  normalizeBrowseRelay,
  relaySetSource,
  sourceFromSearch,
  sourceKey,
  sourceSearch,
} from './relay-browsing'

const key = generateSecretKey()
const setEvent = (tags: string[][], content = '') =>
  finalizeEvent({ kind: 30002, created_at: 1, tags, content }, key)

describe('relay browsing boundaries', () => {
  it('accepts relay hostnames while rejecting non-WebSocket URLs and embedded credentials', () => {
    expect(normalizeBrowseRelay(' Relay.Example/ ')).toBe('wss://relay.example')
    expect(normalizeBrowseRelay('wss://relay.example/feed?token=a')).toBe(
      'wss://relay.example/feed?token=a'
    )
    for (const value of [
      'https://relay.example',
      'wss://user:secret@relay.example',
      'wss://relay.example/#hidden',
      'two relays',
    ]) {
      expect(() => normalizeBrowseRelay(value)).toThrow()
    }
  })

  it('reads public Jumble-compatible set members without treating encrypted content as public', () => {
    const event = setEvent(
      [
        ['d', 'video:relays'],
        ['title', 'Video relays'],
        ['relay', 'wss://relay.example/'],
        ['relay', 'wss://relay.example'],
      ],
      'encrypted-private-content'
    )
    const source = relaySetSource(event)
    expect(source.title).toBe('Video relays')
    expect(source.relays).toEqual(['wss://relay.example'])
    expect(decodeRelaySet(`nostr:${source.address}`).identifier).toBe('video:relays')
    expect(() =>
      relaySetSource(setEvent([['d', 'private']], 'encrypted-private-content'))
    ).toThrow()
  })

  it('rejects unsupported or oversized sets rather than silently changing their members', () => {
    expect(() =>
      relaySetSource(
        setEvent([
          ['d', 'bad'],
          ['relay', 'https://relay.example'],
        ])
      )
    ).toThrow()
    expect(() =>
      relaySetSource(
        setEvent([
          ['d', 'large'],
          ...Array.from({ length: MAX_BROWSE_RELAYS + 1 }, (_, i) => [
            'relay',
            `wss://relay${i}.example`,
          ]),
        ])
      )
    ).toThrow()
    expect(() =>
      decodeRelaySet(
        nip19.naddrEncode({ kind: 30023, pubkey: 'a'.repeat(64), identifier: 'article' })
      )
    ).toThrow()
  })

  it('round-trips multiple relay URLs without losing other feed filters', () => {
    const source = { title: 'Two', relays: ['wss://one.example', 'wss://two.example'] }
    const search = sourceSearch(source, '?q=hello&relay=wss://old.example')
    expect(new URLSearchParams(search).get('q')).toBe('hello')
    expect(sourceFromSearch(search)?.relays).toEqual(source.relays)
    expect(sourceSearch(null, search)).toBe('?q=hello')
    expect(() => sourceFromSearch('?relay=https://not-a-relay.example')).toThrow()
  })

  it('shares set identity rather than a stale snapshot of its members', () => {
    const source = relaySetSource(
      setEvent([
        ['d', 'shared'],
        ['relay', 'wss://relay.example'],
      ])
    )
    const restored = sourceFromSearch(sourceSearch(source))
    expect(restored?.address).toBe(source.address)
    expect(restored?.relays).toEqual([])
    const pointer = decodeRelaySet(source.address!)
    const withHints = {
      ...source,
      address: nip19.naddrEncode({ ...pointer, relays: ['wss://lookup.example'] }),
    }
    expect(sourceKey(withHints)).toBe(sourceKey(source))
    expect(decodeRelaySet(sourceFromSearch(sourceSearch(withHints))!.address!).relays).toEqual([
      'wss://lookup.example',
    ])
  })
})

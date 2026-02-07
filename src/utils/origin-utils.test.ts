import { describe, it, expect } from 'vitest'
import { parseOriginInput, getIdentity, getPlatformName } from './origin-utils'
import { nip19 } from 'nostr-tools'

describe('parseOriginInput', () => {
  it('should parse YouTube URL correctly', () => {
    const input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const tags = parseOriginInput(input)
    expect(tags).toEqual([
      ['r', input],
      ['origin', 'youtube', 'dQw4w9WgXcQ', input],
    ])
  })

  it('should parse YouTube Shorts URL correctly', () => {
    const input = 'https://www.youtube.com/shorts/dQw4w9WgXcQ'
    const tags = parseOriginInput(input)
    expect(tags).toEqual([
      ['r', input],
      ['origin', 'youtube', 'dQw4w9WgXcQ', input],
    ])
  })

  it('should parse TikTok URL correctly', () => {
    const input = 'https://www.tiktok.com/@user/video/7123456789012345678'
    const tags = parseOriginInput(input)
    expect(tags).toEqual([
      ['r', input],
      ['origin', 'tiktok', '7123456789012345678', input],
    ])
  })

  it('should parse npub correctly', () => {
    const hex = '3bf0c63fcb29d869287c8a6d9e1cecc32740982f39e21510b20b897fd6bfa2d2'
    const npub = nip19.npubEncode(hex)
    const tags = parseOriginInput(npub)
    expect(tags).toEqual([['p', hex]])
  })

  it('should parse note correctly', () => {
    const hex = '3bf0c63fcb29d869287c8a6d9e1cecc32740982f39e21510b20b897fd6bfa2d2'
    const note = nip19.noteEncode(hex)
    const tags = parseOriginInput(note)
    expect(tags).toEqual([['e', hex]])
  })

  it('should parse nevent with relay correctly', () => {
    const hex = '3bf0c63fcb29d869287c8a6d9e1cecc32740982f39e21510b20b897fd6bfa2d2'
    const relay = 'wss://relay.damus.io'
    const nevent = nip19.neventEncode({ id: hex, relays: [relay] })
    const tags = parseOriginInput(nevent)
    expect(tags?.[0][0]).toBe('e')
    expect(tags?.[0][1]).toBe(hex)
    expect(tags?.[0][2]).toBe(relay)
  })

  it('should parse naddr correctly', () => {
    // naddr1qqrhs5rdxptnxeszyzyxthe56904ceg2gu8huh83gcawf85lqtj3dnu3q9h68804fdapqqcyqqqgtwcu7y26n
    // kind: 34235, pubkey: 8865df34d15f5c650a470f7e5cf1463ae49e9f02e516cf91016fa39df54b7a10, identifier: xPm0W3f
    const naddr =
      'naddr1qqrhs5rdxptnxeszyzyxthe56904ceg2gu8huh83gcawf85lqtj3dnu3q9h68804fdapqqcyqqqgtwcu7y26n'
    const tags = parseOriginInput(naddr)
    expect(tags?.[0][0]).toBe('a')
    expect(tags?.[0][1]).toBe(
      '34235:8865df34d15f5c650a470f7e5cf1463ae49e9f02e516cf91016fa39df54b7a10:xPm0W3f'
    )
  })

  it('should reject invalid text', () => {
    expect(parseOriginInput('hello world')).toBeNull()
    expect(parseOriginInput('not a url')).toBeNull()
  })

  it('should accept valid generic URL', () => {
    const url = 'https://example.com/video'
    expect(parseOriginInput(url)).toEqual([['r', url]])
  })

  it('should parse raw hex as event ID', () => {
    const hex = '3bf0c63fcb29d869287c8a6d9e1cecc32740982f39e21510b20b897fd6bfa2d2'
    expect(parseOriginInput(hex)).toEqual([['e', hex]])
  })
})

describe('getIdentity', () => {
  it('should return identity for youtube origin', () => {
    const tags = [
      ['r', 'url'],
      ['origin', 'youtube', 'ID', 'url'],
    ]
    expect(getIdentity(tags)).toBe('youtube:ID')
  })

  it('should return identity for nostr event', () => {
    const tags = [['e', 'HEX']]
    expect(getIdentity(tags)).toBe('nostr:HEX')
  })

  it('should return identity for generic URL', () => {
    const tags = [['r', 'https://example.com']]
    expect(getIdentity(tags)).toBe('https://example.com')
  })
})

describe('getPlatformName', () => {
  it('should return youtube for youtube origin', () => {
    const tags = [['origin', 'youtube', 'ID']]
    expect(getPlatformName(tags)).toBe('youtube')
  })

  it('should return nostr for e tag', () => {
    const tags = [['e', 'HEX']]
    expect(getPlatformName(tags)).toBe('nostr')
  })

  it('should return web for r tag', () => {
    const tags = [['r', 'URL']]
    expect(getPlatformName(tags)).toBe('web')
  })
})

import { describe, it, expect } from 'vitest'
import { decodeEventPointer, decodeVideoEventIdentifier } from './nip19'

describe('nip19 video identifier decoding', () => {
  // Valid test identifiers generated with nostr-tools
  const sampleNevent =
    'nevent1qvzqqqqqz5q3gamnwvaz7tmjv4kxz7fwv3sk6atn9e5k7qpq5lgxjk20k389myt5dq6rlf20tzsnamh3e42fv8nvxkgw34ave3asl5um4j'

  const sampleNaddr =
    'naddr1qvzqqqy9hvpzplfwuf0apm6y92smwsz2jd2tztj4fmqdatvp5mytmwxd5tlsjdelqy28wumn8ghj7un9d3shjtnyv9kh2uewd9hsqrr5v4ehgttkd9jx2medxydngk44'

  describe('decodeEventPointer', () => {
    it('should decode nevent identifiers', () => {
      const result = decodeEventPointer(sampleNevent)
      expect(result).not.toBeNull()
      expect(result).toHaveProperty('id')
    })

    it('should return null for naddr identifiers', () => {
      // This is the current behavior that causes the bug
      const result = decodeEventPointer(sampleNaddr)
      expect(result).toBeNull()
    })
  })

  describe('decodeVideoEventIdentifier', () => {
    it('should decode nevent identifiers as event type', () => {
      const result = decodeVideoEventIdentifier(sampleNevent)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('event')
      expect(result?.data).toHaveProperty('id')
    })

    it('should decode naddr identifiers as address type', () => {
      // This test shows the correct behavior for naddr
      const result = decodeVideoEventIdentifier(sampleNaddr)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('address')
      expect(result?.data).toHaveProperty('kind')
      expect(result?.data).toHaveProperty('pubkey')
      expect(result?.data).toHaveProperty('identifier')
    })
  })

  describe('VideoPage decoder usage - regression test', () => {
    it('should demonstrate that decodeEventPointer fails for naddr (current bug)', () => {
      // This is what VideoPage currently does (buggy)
      const eventPointer = decodeEventPointer(sampleNaddr)

      // This assertion documents the bug: eventPointer is null for naddr
      expect(eventPointer).toBeNull()
    })

    it('should demonstrate that decodeVideoEventIdentifier works for naddr (correct behavior)', () => {
      // This is what VideoPage should do (fixed)
      const videoIdentifier = decodeVideoEventIdentifier(sampleNaddr)

      // This assertion shows the correct behavior: videoIdentifier is not null
      expect(videoIdentifier).not.toBeNull()
      expect(videoIdentifier?.type).toBe('address')

      // And it provides the data needed to load addressable events
      const addressData = videoIdentifier?.data
      expect(addressData).toHaveProperty('kind')
      expect(addressData).toHaveProperty('pubkey')
      expect(addressData).toHaveProperty('identifier')
    })
  })
})

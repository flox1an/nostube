import { describe, it, expect } from 'vitest'
import { sanitizeRelayUrl } from './utils'

describe('sanitizeRelayUrl', () => {
  it('should handle normal relay URLs without modification', () => {
    const result = sanitizeRelayUrl('wss://relay.damus.io')
    expect(result).toEqual(['wss://relay.damus.io'])
  })

  it('should normalize relay URLs by removing trailing slashes', () => {
    const result = sanitizeRelayUrl('wss://nos.lol/')
    expect(result).toEqual(['wss://nos.lol'])
  })

  it('should ignore corrupted concatenated relay URLs', () => {
    const corrupted =
      'wss://nos.lol/%20wss://nostr.land/%20%20avatar%20wss://nostr.wine/%20%20avatar%20wss://purplerelay.com/%20wss://relay.damus.io/%20wss://relay.snort.social/'

    const result = sanitizeRelayUrl(corrupted)

    // Should return empty array for corrupted URLs
    expect(result).toEqual([])
  })

  it('should return empty array for URLs with URL-encoded spaces', () => {
    const result = sanitizeRelayUrl('wss://relay.example.com/%20something')
    expect(result).toEqual([])
  })

  it('should return empty array for URLs with whitespace', () => {
    const result = sanitizeRelayUrl('wss://relay.example.com something')
    expect(result).toEqual([])
  })

  it('should return empty array for URLs with "avatar" keyword', () => {
    const result = sanitizeRelayUrl('wss://relay.example.com/avatar')
    expect(result).toEqual([])
  })

  it('should return empty array for completely invalid URLs', () => {
    const result = sanitizeRelayUrl('avatar%20something%20random')
    expect(result).toEqual([])
  })

  it('should handle empty or whitespace strings', () => {
    expect(sanitizeRelayUrl('')).toEqual([])
    expect(sanitizeRelayUrl('   ')).toEqual([])
  })

  it('should ignore the exact corrupted URL from the bug report', () => {
    // This is the actual corrupted URL from relay tag [2]
    const corrupted =
      'wss://nos.lol/%20wss://nostr.land/%20%20avatar%20wss://nostr.wine/%20%20avatar%20wss://purplerelay.com/%20wss://relay.damus.io/%20wss://relay.snort.social/'

    const result = sanitizeRelayUrl(corrupted)

    // Should return empty array for corrupted URL
    expect(result).toEqual([])
  })

  it('should ignore URLs with multiple protocols', () => {
    const corrupted = 'wss://relay1.com wss://relay2.com'
    const result = sanitizeRelayUrl(corrupted)

    // Should return empty array due to whitespace
    expect(result).toEqual([])
  })

  it('should accept valid relay URLs with ports', () => {
    const result = sanitizeRelayUrl('wss://relay.example.com:443')
    expect(result).toEqual(['wss://relay.example.com:443'])
  })

  it('should accept valid relay URLs with paths', () => {
    const result = sanitizeRelayUrl('wss://relay.example.com/relay')
    expect(result).toEqual(['wss://relay.example.com/relay'])
  })
})

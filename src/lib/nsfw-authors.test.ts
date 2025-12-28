import { describe, it, expect } from 'vitest'
import { isNSFWAuthor } from './nsfw-authors'

describe('nsfw-authors', () => {
  // Sample NSFW pubkeys for testing
  const testNsfwPubkeys = [
    'e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400',
    'f8f6b6f741bd422346579304550de64a6445fd332c50389e9a1f4d8294a101e0',
    '0c9fb0a86f622b23e7802fbccf3c676cd4562ba267df4b3048f7dc77e9124a90',
  ]

  describe('isNSFWAuthor', () => {
    it('should return true for a pubkey in the NSFW list', () => {
      expect(
        isNSFWAuthor(
          'e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400',
          testNsfwPubkeys
        )
      ).toBe(true)
    })

    it('should return true for second NSFW author pubkey', () => {
      expect(
        isNSFWAuthor(
          'f8f6b6f741bd422346579304550de64a6445fd332c50389e9a1f4d8294a101e0',
          testNsfwPubkeys
        )
      ).toBe(true)
    })

    it('should return true for third NSFW author pubkey', () => {
      expect(
        isNSFWAuthor(
          '0c9fb0a86f622b23e7802fbccf3c676cd4562ba267df4b3048f7dc77e9124a90',
          testNsfwPubkeys
        )
      ).toBe(true)
    })

    it('should return false for non-NSFW author pubkey', () => {
      expect(
        isNSFWAuthor(
          'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81',
          testNsfwPubkeys
        )
      ).toBe(false)
    })

    it('should return false for undefined pubkey', () => {
      expect(isNSFWAuthor(undefined, testNsfwPubkeys)).toBe(false)
    })

    it('should return false for empty string pubkey', () => {
      expect(isNSFWAuthor('', testNsfwPubkeys)).toBe(false)
    })

    it('should return false for random pubkey', () => {
      expect(
        isNSFWAuthor(
          '0000000000000000000000000000000000000000000000000000000000000000',
          testNsfwPubkeys
        )
      ).toBe(false)
    })

    it('should return false when nsfwPubkeys list is empty', () => {
      expect(
        isNSFWAuthor('e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400', [])
      ).toBe(false)
    })

    it('should return false when nsfwPubkeys list is undefined', () => {
      expect(isNSFWAuthor('e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400')).toBe(
        false
      )
    })
  })
})

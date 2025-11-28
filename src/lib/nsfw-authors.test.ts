import { describe, it, expect } from 'vitest'
import { isNSFWAuthor, NSFW_AUTHORS } from './nsfw-authors'

describe('nsfw-authors', () => {
  describe('NSFW_AUTHORS', () => {
    it('should contain expected pubkeys', () => {
      expect(NSFW_AUTHORS).toEqual([
        'e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400',
        'f8f6b6f741bd422346579304550de64a6445fd332c50389e9a1f4d8294a101e0',
      ])
    })

    it('should have 2 NSFW authors', () => {
      expect(NSFW_AUTHORS).toHaveLength(2)
    })
  })

  describe('isNSFWAuthor', () => {
    it('should return true for first NSFW author pubkey', () => {
      expect(isNSFWAuthor('e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400')).toBe(
        true
      )
    })

    it('should return true for second NSFW author pubkey', () => {
      expect(isNSFWAuthor('f8f6b6f741bd422346579304550de64a6445fd332c50389e9a1f4d8294a101e0')).toBe(
        true
      )
    })

    it('should return false for non-NSFW author pubkey', () => {
      expect(isNSFWAuthor('b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81')).toBe(
        false
      )
    })

    it('should return false for undefined pubkey', () => {
      expect(isNSFWAuthor(undefined)).toBe(false)
    })

    it('should return false for empty string pubkey', () => {
      expect(isNSFWAuthor('')).toBe(false)
    })

    it('should return false for random pubkey', () => {
      expect(isNSFWAuthor('0000000000000000000000000000000000000000000000000000000000000000')).toBe(
        false
      )
    })
  })
})

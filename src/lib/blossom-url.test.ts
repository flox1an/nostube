import { describe, it, expect } from 'vitest'
import {
  extractBlossomHash,
  isBlossomUrl,
  parseBlossomUrl,
  isNonBlossomServer,
  isBlossomServerBlocked,
  NON_BLOSSOM_SERVERS,
  BLOCKED_BLOSSOM_SERVERS,
} from './blossom-url'

describe('extractBlossomHash', () => {
  it('should extract hash and extension from valid Blossom URL', () => {
    const url =
      'https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e')
    expect(result.ext).toBe('mp4')
  })

  it('should extract hash and extension from another valid Blossom URL', () => {
    const url =
      'https://blossom.primal.net/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27')
    expect(result.ext).toBe('mp4')
  })

  it('should handle URLs with .webp extension', () => {
    const url =
      'https://nostr.download/thumb/f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0.webp'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('f6551d07b3ad65b6137780a68b5492ea541182fc16717d21b18cedfb8d6ef4d0')
    expect(result.ext).toBe('webp')
  })

  it('should return empty object for non-Blossom URL', () => {
    const url = 'https://v.nostr.build/RIbToHsVig5gjGLf.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBeUndefined()
    expect(result.ext).toBeUndefined()
  })

  it('should return empty object for invalid URL', () => {
    const url = 'not-a-valid-url'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBeUndefined()
    expect(result.ext).toBeUndefined()
  })

  it('should handle URLs with paths containing multiple segments', () => {
    const url =
      'https://example.com/path/to/a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057.png'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('a3a9cb9757f48dd7279cdd0473934ee1799f3a3e969b391f6e16d746b0c43057')
    expect(result.ext).toBe('png')
  })

  it('should return empty object for non-Blossom servers that resize/re-encode', () => {
    const url =
      'https://video.nostr.build/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBeUndefined()
    expect(result.ext).toBeUndefined()
  })

  it('should return empty object for cdn.nostrcheck.me', () => {
    const url =
      'https://cdn.nostrcheck.me/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBeUndefined()
    expect(result.ext).toBeUndefined()
  })

  it('should handle bare hash without extension', () => {
    const url =
      'https://blossom.example.com/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27')
    expect(result.ext).toBeUndefined()
  })

  it('should normalize hash to lowercase', () => {
    const url =
      'https://blossom.example.com/CF5A5FF1DDDC3B97D8938F33D1088C9E5BABCDC3F94C5178112392E9B3A36D27.mp4'
    const result = extractBlossomHash(url)

    expect(result.sha256).toBe('cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27')
  })
})

describe('isBlossomUrl', () => {
  it('should return true for valid Blossom URL', () => {
    const url =
      'https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4'
    expect(isBlossomUrl(url)).toBe(true)
  })

  it('should return false for non-Blossom URL', () => {
    const url = 'https://v.nostr.build/RIbToHsVig5gjGLf.mp4'
    expect(isBlossomUrl(url)).toBe(false)
  })

  it('should return false for non-Blossom servers', () => {
    const url =
      'https://video.nostr.build/cf5a5ff1dddc3b97d8938f33d1088c9e5babcdc3f94c5178112392e9b3a36d27.mp4'
    expect(isBlossomUrl(url)).toBe(false)
  })
})

describe('parseBlossomUrl', () => {
  it('should parse valid Blossom URL', () => {
    const url =
      'https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4'
    const result = parseBlossomUrl(url)

    expect(result.isBlossomUrl).toBe(true)
    expect(result.sha256).toBe('0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e')
    expect(result.ext).toBe('mp4')
    expect(result.server).toBe('https://almond.slidestr.net')
  })

  it('should return isBlossomUrl: false for non-Blossom URL', () => {
    const url = 'https://v.nostr.build/RIbToHsVig5gjGLf.mp4'
    const result = parseBlossomUrl(url)

    expect(result.isBlossomUrl).toBe(false)
    expect(result.sha256).toBeUndefined()
  })
})

describe('isNonBlossomServer', () => {
  it('should return true for video.nostr.build', () => {
    expect(isNonBlossomServer('https://video.nostr.build/abc.mp4')).toBe(true)
  })

  it('should return true for cdn.nostrcheck.me', () => {
    expect(isNonBlossomServer('https://cdn.nostrcheck.me/abc.mp4')).toBe(true)
  })

  it('should return false for regular Blossom servers', () => {
    expect(isNonBlossomServer('https://almond.slidestr.net/abc.mp4')).toBe(false)
    expect(isNonBlossomServer('https://blossom.primal.net/abc.mp4')).toBe(false)
  })
})

describe('isBlossomServerBlocked', () => {
  it('should return true for blocked servers', () => {
    expect(isBlossomServerBlocked('https://cdn.nostrcheck.me')).toBe(true)
    expect(isBlossomServerBlocked('cdn.nostrcheck.me')).toBe(true)
  })

  it('should return false for non-blocked servers', () => {
    expect(isBlossomServerBlocked('https://almond.slidestr.net')).toBe(false)
    expect(isBlossomServerBlocked('https://blossom.primal.net')).toBe(false)
  })
})

describe('constants', () => {
  it('should have NON_BLOSSOM_SERVERS defined', () => {
    expect(NON_BLOSSOM_SERVERS).toContain('video.nostr.build')
    expect(NON_BLOSSOM_SERVERS).toContain('cdn.nostrcheck.me')
  })

  it('should have BLOCKED_BLOSSOM_SERVERS defined', () => {
    expect(BLOCKED_BLOSSOM_SERVERS).toContain('cdn.nostrcheck.me')
  })
})

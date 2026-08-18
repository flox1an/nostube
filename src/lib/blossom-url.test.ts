import { describe, expect, it } from 'vitest'
import { extractBlossomHash, isNonBlossomServer, parseBlossomUrl } from './blossom-url'

const HASH = '0ebb55ed4d269015f2c6fb7119e8ff8686110cad690443894b31287866758a5e'

describe('isNonBlossomServer', () => {
  it('flags image.nostr.build, whose filename hash does not match the file content', () => {
    expect(isNonBlossomServer(`https://image.nostr.build/${HASH}.jpg`)).toBe(true)
  })

  it('flags video.nostr.build and cdn.nostrcheck.me', () => {
    expect(isNonBlossomServer(`https://video.nostr.build/${HASH}.mp4`)).toBe(true)
    expect(isNonBlossomServer(`https://cdn.nostrcheck.me/${HASH}.jpg`)).toBe(true)
  })

  it('does not flag a real Blossom server', () => {
    expect(isNonBlossomServer(`https://blossom.example/${HASH}.jpg`)).toBe(false)
  })
})

describe('extractBlossomHash / parseBlossomUrl for image.nostr.build', () => {
  it('reports no hash, so callers fall back to the raw URL instead of a bogus hash lookup', () => {
    const url = `https://image.nostr.build/${HASH}.jpg`
    expect(extractBlossomHash(url)).toEqual({})
    expect(parseBlossomUrl(url)).toEqual({ isBlossomUrl: false })
  })
})

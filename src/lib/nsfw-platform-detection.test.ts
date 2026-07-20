import { describe, expect, it } from 'vitest'
import { getExplicitContentWarning, hasNsfwPlatformAttributes } from './nsfw-platform-detection'

describe('NSFW platform detection', () => {
  it('detects the supplied xHamster import attributes', () => {
    expect(
      hasNsfwPlatformAttributes([
        ['d', 'xhamster-xhvyK3N'],
        ['source', 'xhamster'],
      ])
    ).toBe(true)
  })

  it('matches d prefixes and exact source values case-insensitively', () => {
    expect(hasNsfwPlatformAttributes([['d', '  XHAMSTER-video']])).toBe(true)
    expect(hasNsfwPlatformAttributes([['source', ' XhAmStEr ']])).toBe(true)
  })

  it('detects a matching value in any repeated d or source tag', () => {
    expect(
      hasNsfwPlatformAttributes([
        ['source', 'youtube'],
        ['source', 'xhamster'],
      ])
    ).toBe(true)
  })

  it('does not match unrelated attributes or source prefixes', () => {
    expect(hasNsfwPlatformAttributes([['d', 'youtube-video']])).toBe(false)
    expect(hasNsfwPlatformAttributes([['source', 'xhamster-mirror']])).toBe(false)
  })

  it('preserves explicit warnings and ignores whitespace-only warnings', () => {
    expect(getExplicitContentWarning([['content-warning', 'Graphic violence']])).toBe(
      'Graphic violence'
    )
    expect(getExplicitContentWarning([['content-warning', '  ']])).toBeUndefined()
  })
})

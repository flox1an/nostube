import { describe, expect, it } from 'vitest'
import { getOriginLink } from './origin-utils'

describe('getOriginLink', () => {
  it('returns a public web URL unchanged', () => {
    expect(getOriginLink('https://example.com/video')).toBe('https://example.com/video')
  })

  it('does not invent a URL for a BitVid origin without an explicit URL', () => {
    expect(getOriginLink(undefined)).toBeUndefined()
  })

  it.each(['nostr:note1invalid', 'javascript:alert(1)', 'http://127.0.0.1/private'])(
    'does not create an external link for %s',
    originUrl => {
      expect(getOriginLink(originUrl)).toBeUndefined()
    }
  )
})

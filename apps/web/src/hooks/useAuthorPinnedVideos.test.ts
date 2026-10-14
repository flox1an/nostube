import { describe, it, expect } from 'vitest'
import { parsePinRefs } from './useAuthorPinnedVideos'

describe('parsePinRefs', () => {
  it('extracts event ids from e tags', () => {
    expect(parsePinRefs([['e', 'abc123']])).toEqual([{ id: 'abc123' }])
  })

  it('extracts only video kinds from a tags', () => {
    const tags = [
      ['a', '34235:pubkey1:video-1'],
      ['a', '34236:pubkey2:short-1'],
      ['a', '30005:pubkey3:playlist-1'], // playlists are not videos
      ['a', 'not-a-kind:pubkey4:x'],
      ['e'], // no value
      ['p', 'someone'], // not a pin reference
    ]
    expect(parsePinRefs(tags)).toEqual([
      { address: '34235:pubkey1:video-1' },
      { address: '34236:pubkey2:short-1' },
    ])
  })

  it('returns nothing for tags without values', () => {
    expect(parsePinRefs([['e'], ['a'], []])).toEqual([])
  })
})

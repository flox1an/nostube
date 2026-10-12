import { describe, expect, it } from 'vitest'
import { searchVideos } from './video-search'

const cafe = { title: 'Café Tour', searchText: 'café tour a morning in lisbon travel' }
const bike = { title: 'Bike repair', searchText: 'bike repair fixing a flat tyre diy' }
const videos = [cafe, bike]

describe('searchVideos', () => {
  it('ignores case and diacritics on both sides', () => {
    expect(searchVideos(videos, 'CAFE')).toEqual([cafe])
    expect(searchVideos([{ searchText: 'cafe' }], 'Café')).toHaveLength(1)
  })

  it('needs every word, in any order, and matches inside words', () => {
    expect(searchVideos(videos, 'lisbon tour')).toEqual([cafe])
    expect(searchVideos(videos, 'tour bike')).toEqual([])
    expect(searchVideos(videos, 'repa')).toEqual([bike])
  })

  it('finds nothing for an empty or blank query and keeps the catalog order', () => {
    expect(searchVideos(videos, '')).toEqual([])
    expect(searchVideos(videos, '   ')).toEqual([])
    expect(searchVideos(videos, 'a')).toEqual([cafe, bike])
  })

  it('searches only the text the caller picks', () => {
    expect(searchVideos(videos, 'lisbon', v => v.title)).toEqual([])
    expect(searchVideos(videos, 'tour', v => v.title)).toEqual([cafe])
  })
})

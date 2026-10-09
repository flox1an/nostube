import { describe, expect, it } from 'vitest'
import { parseTags } from './tags'

describe('parseTags', () => {
  it('splits on spaces and commas, drops # and case, keeps each tag once', () => {
    expect(parseTags('Travel, #berlin  trip,travel')).toEqual(['travel', 'berlin', 'trip'])
  })

  it('is empty for nothing', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags(' ,, # ')).toEqual([])
  })
})

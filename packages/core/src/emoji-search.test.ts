import { describe, expect, it } from 'vitest'
import { loadUnicodeEmojis, searchUnicodeEmojis } from './emoji-search'

describe('searchUnicodeEmojis', () => {
  it('finds emoji by shortcode, label and keyword, exact names first', async () => {
    const emojis = await loadUnicodeEmojis()
    const find = (query: string) => searchUnicodeEmojis(emojis, query, 5).map(e => e.unicode)
    expect(find('fire')[0]).toBe('🔥')
    expect(find('fir')[0]).toBe('🔥')
    expect(find('joy')[0]).toBe('😂')
    expect(find('thumbsup')[0]).toBe('👍')
    expect(find('flame')).toContain('🔥')
    expect(find('zzzzqq')).toEqual([])
  })

  it('leaves out skin tone swatches', async () => {
    const emojis = await loadUnicodeEmojis()
    expect(emojis.some(e => e.unicode === '🏻')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { THEME_BACKGROUNDS, contrastRatio, readableOn } from './site-theme'

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for the same colour', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#336699', '#336699')).toBe(1)
  })

  it('tells a dark accent on the dark page from a readable one', () => {
    expect(contrastRatio('#1a1a40', THEME_BACKGROUNDS.dark)).toBeLessThan(3)
    expect(contrastRatio('#e11d48', THEME_BACKGROUNDS.dark)).toBeGreaterThan(3)
    expect(contrastRatio('#fde68a', THEME_BACKGROUNDS.light)).toBeLessThan(3)
  })
})

describe('readableOn', () => {
  it('picks the text colour with the better contrast', () => {
    for (const bg of ['#00aa55', '#f97316', '#1a1a8c', '#f5f5dc', '#e11d48']) {
      const picked = readableOn(bg)
      const other = picked === '#111111' ? '#ffffff' : '#111111'
      expect(contrastRatio(bg, picked)).toBeGreaterThanOrEqual(contrastRatio(bg, other))
    }
  })
})

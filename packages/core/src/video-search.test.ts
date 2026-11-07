import { describe, expect, it } from 'vitest'
import { titleMatchesSearch } from './video-search'

describe('titleMatchesSearch', () => {
  it('ignores case and diacritics on both sides', () => {
    expect(titleMatchesSearch('Café Tour', 'CAFE')).toBe(true)
    expect(titleMatchesSearch('cafe tour', 'Café')).toBe(true)
    expect(titleMatchesSearch('Führung', 'fu\u0308h')).toBe(true)
  })

  it('needs every term as a word prefix, in any order', () => {
    expect(titleMatchesSearch('Bike repair', 'rep bi')).toBe(true)
    expect(titleMatchesSearch('Bike repair', 'pair')).toBe(false)
    expect(titleMatchesSearch('Bike repair', 'bike tour')).toBe(false)
    // Punctuation splits terms the way the relay's tokenizer does.
    expect(titleMatchesSearch('Rock-n-roll night', 'roll-rock')).toBe(true)
  })

  it('drops NIP-50 extensions and matches nothing without terms', () => {
    expect(titleMatchesSearch('Bike repair', 'bike include:spam')).toBe(true)
    expect(titleMatchesSearch('Bike repair', '')).toBe(false)
    expect(titleMatchesSearch('Bike repair', ' -- language:en ')).toBe(false)
  })
})

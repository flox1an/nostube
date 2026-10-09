import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE, GROUPS, PAGES, hashFor, pageFromHash } from './route'

describe('route', () => {
  it('maps hashes to pages and back', () => {
    for (const page of PAGES) expect(pageFromHash(hashFor(page.id))).toBe(page.id)
  })

  it('falls back to the start page for nothing or nonsense', () => {
    for (const hash of ['', '#', '#/', '#/nope', '#/../etc']) {
      expect(pageFromHash(hash)).toBe(DEFAULT_PAGE)
    }
  })

  it('ignores a query or a sub path after the page', () => {
    expect(pageFromHash('#/appearance?x=1')).toBe('appearance')
    expect(pageFromHash('#/instance/more')).toBe('instance')
  })

  it('puts every page into a known group', () => {
    const groups = new Set(GROUPS.map(g => g.id))
    for (const page of PAGES) expect(groups.has(page.group)).toBe(true)
  })
})

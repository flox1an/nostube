import { describe, expect, it } from 'vitest'
import { loadInstanceAccent } from './instance-accent'

const answer =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('loadInstanceAccent', () => {
  it('reads the accent of the instance config without the #', async () => {
    const config = { site: { theme: { accent: '#0d9488', font: 'sans' } } }
    expect(await loadInstanceAccent(answer(config))).toBe('0d9488')
  })

  it.each([
    ['a missing config', answer({}, 404)],
    ['a body without a site', answer({ title: 'x' })],
    ['an invalid colour', answer({ site: { theme: { accent: 'red' } } })],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('returns null for %s', async (_name, fetcher) => {
    expect(await loadInstanceAccent(fetcher as typeof fetch)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_LINKS, type InstanceConfig } from '@nostube/core/instance-config'
import { accentFor, loadEmbedInstance } from './instance'

const config = (accent = '#0d9488'): InstanceConfig => ({
  version: 1,
  revision: 1,
  origin: 'https://videos.example.org',
  title: 'T',
  creators: ['a'.repeat(64)],
  startPage: { kind: 'creator-profile', creator: 'a'.repeat(64) },
  videoSources: ['wss://videos.example.org'],
  interactionRelays: [],
  search: { mode: 'off' },
  site: {
    tagline: '',
    theme: { accent, font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
  },
})
const answer =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('loadEmbedInstance', () => {
  it('reads and validates the config of the instance', async () => {
    expect((await loadEmbedInstance(answer(config()), true))?.origin).toBe(
      'https://videos.example.org'
    )
  })

  it('does not ask at all outside an instance', async () => {
    let asked = false
    const fetcher = (async () => {
      asked = true
      return new Response('{}')
    }) as typeof fetch
    expect(await loadEmbedInstance(fetcher, false)).toBeNull()
    expect(asked).toBe(false)
  })

  it.each([
    ['a missing config', answer({}, 404)],
    ['an invalid config', answer({ title: 'x' })],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('returns null for %s', async (_name, fetcher) => {
    expect(await loadEmbedInstance(fetcher as typeof fetch, true)).toBeNull()
  })
})

describe('accentFor', () => {
  it('is the accent without the #, unless the URL names a colour', () => {
    expect(accentFor(config(), '?v=naddr1')).toBe('0d9488')
    expect(accentFor(config(), '?v=naddr1&color=ff0000')).toBeNull()
    expect(accentFor(null, '')).toBeNull()
  })
})

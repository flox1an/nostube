import { DEFAULT_SITE_LINKS } from '@nostube/core/instance-config'
import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import type { AdminConfig } from './api'
import {
  LINK_PRESETS,
  addKeyToConfig,
  fromDraft,
  isKeyConnected,
  isRefHidden,
  linkPresetOf,
  setRefHidden,
  toDraft,
} from './draft'

const PK = 'a'.repeat(64)
const config: AdminConfig = {
  title: 'Flox',
  creators: [PK],
  allowedWriters: [PK],
  videoSources: ['wss://relay.example'],
  interactionRelays: [],
  search: { mode: 'off' },
  storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
  site: {
    tagline: 'Hi',
    theme: { accent: '#6d28d9', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
  },
}

describe('draft', () => {
  it('round-trips a config unchanged', () => {
    const result = fromDraft(toDraft(config))
    expect(result.config).toEqual(config)
  })

  it('accepts npub keys and pasted video links, and stores hex and video refs', () => {
    const naddr = nip19.naddrEncode({ kind: 34235, pubkey: PK, identifier: 'intro' })
    const draft = {
      ...toDraft(config),
      creatorsText: nip19.npubEncode(PK),
      hiddenText: `https://site.example/v/${naddr}\n${naddr}`,
    }
    const result = fromDraft(draft)
    expect(result.config?.creators).toEqual([PK])
    expect(result.config?.site.videos.hidden).toEqual([`34235:${PK}:intro`])
  })

  it.each([
    ['title', { title: '  ' }],
    ['accent', { accent: 'red' }],
    ['creator', { creatorsText: 'nope' }],
    ['relay', { videoSourcesText: 'https://relay.example' }],
    ['hidden video', { hiddenText: 'not a video' }],
    [
      'link without a placeholder',
      { links: { ...DEFAULT_SITE_LINKS, note: 'https://example.org/' } },
    ],
    ['link over http', { links: { ...DEFAULT_SITE_LINKS, profile: 'http://example.org/{nip19}' } }],
    ['quota', { quota: '-1' }],
    ['external search', { searchMode: 'external' as const, searchUrl: 'http://x' }],
  ])('reports an invalid %s and builds nothing', (_name, patch) => {
    const result = fromDraft({ ...toDraft(config), ...patch })
    expect(result.config).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('hidden video lines', () => {
  const ref = `34235:${PK}:intro`
  const naddr = nip19.naddrEncode({ kind: 34235, pubkey: PK, identifier: 'intro' })

  it('finds a video however its line was written', () => {
    expect(isRefHidden(ref, ref)).toBe(true)
    expect(isRefHidden(`https://site.example/v/${naddr}`, ref)).toBe(true)
    expect(isRefHidden('', ref)).toBe(false)
    expect(isRefHidden(`34235:${PK}:other`, ref)).toBe(false)
  })

  it('switches a video off that was hidden by its event id', () => {
    const id = 'e'.repeat(64)
    const text = `${id}\nsomething else`
    expect(isRefHidden(text, id)).toBe(true)
    const off = setRefHidden(text, [ref, id], false)
    expect(isRefHidden(off, ref)).toBe(false)
    expect(isRefHidden(off, id)).toBe(false)
    expect(off).toBe('something else')
  })

  it('adds a video once and removes every spelling of it', () => {
    expect(setRefHidden('', ref, true)).toBe(ref)
    expect(setRefHidden(ref, ref, true)).toBe(ref)
    expect(setRefHidden(`${naddr}\nsomething else`, ref, false)).toBe('something else')
  })
})

describe('link presets', () => {
  it('recognises a preset and everything else as custom', () => {
    for (const preset of LINK_PRESETS) expect(linkPresetOf(preset.links)).toBe(preset.id)
    expect(linkPresetOf({ ...DEFAULT_SITE_LINKS, video: 'https://example.org/v/{nip19}' })).toBe(
      'custom'
    )
  })
})

describe('connecting a key', () => {
  const empty: AdminConfig = { ...config, creators: [], allowedWriters: [] }
  const KEY = 'b'.repeat(64)

  it('makes the key creator and writer of an empty instance', () => {
    const next = addKeyToConfig(empty, KEY)
    expect(next.creators).toEqual([KEY])
    expect(next.allowedWriters).toEqual([KEY])
    expect(isKeyConnected(next, KEY)).toBe(true)
  })

  it('adds a key once and keeps the first creator first', () => {
    const next = addKeyToConfig(addKeyToConfig(config, KEY), KEY)
    expect(next.creators).toEqual([PK, KEY])
    expect(next.allowedWriters).toEqual([PK, KEY])
  })

  it('knows when a key still has to be connected', () => {
    expect(isKeyConnected(empty, KEY)).toBe(false)
    expect(isKeyConnected(config, null)).toBe(false)
    expect(isKeyConnected({ ...config, allowedWriters: [] }, PK)).toBe(false)
  })
})

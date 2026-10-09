import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import type { AdminConfig } from './api'
import { fromDraft, toDraft } from './draft'

const PK = 'a'.repeat(64)
const config: AdminConfig = {
  title: 'Flox',
  creators: [PK],
  allowedWriters: [PK],
  videoSources: ['wss://relay.example'],
  interactionRelays: [],
  search: { mode: 'off' },
  storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
  site: { tagline: 'Hi', theme: { accent: '#6d28d9', font: 'sans' }, videos: { hidden: [] } },
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
    ['quota', { quota: '-1' }],
    ['external search', { searchMode: 'external' as const, searchUrl: 'http://x' }],
  ])('reports an invalid %s and builds nothing', (_name, patch) => {
    const result = fromDraft({ ...toDraft(config), ...patch })
    expect(result.config).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

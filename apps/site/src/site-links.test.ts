import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_LINKS, type InstanceConfig } from '@nostube/core/instance-config'
import { siteLinks } from './site-links'

const CREATOR = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const INSTANCE_RELAYS = ['wss://interact.example', 'wss://videos.example']
const config = {
  creators: [CREATOR],
  videoSources: ['wss://videos.example'],
  interactionRelays: ['wss://interact.example'],
  site: {
    tagline: '',
    theme: { accent: '#112233', font: 'sans' },
    videos: { hidden: [] },
    links: { ...DEFAULT_SITE_LINKS, profile: 'https://people.example/{nip19}' },
  },
} as unknown as InstanceConfig
const links = siteLinks(config)

const entity = (target: { href?: string }) =>
  nip19.decode(new URL(target.href!).pathname.split('/').pop()!)

describe('siteLinks', () => {
  it('sends the creator home and links everyone else as nprofile with the instance relays', () => {
    expect(links.profile({ pubkey: CREATOR, relays: [] })).toEqual({ to: '/' })
    const decoded = entity(links.profile({ pubkey: OTHER, relays: [] }) as { href?: string })
    expect(decoded).toMatchObject({ type: 'nprofile', data: { pubkey: OTHER } })
    // Text hints stay first, the instance's relays complete them.
    expect(
      entity(links.profile({ pubkey: OTHER, relays: ['wss://said.example'] }) as { href?: string })
        .data
    ).toMatchObject({ relays: ['wss://said.example', ...INSTANCE_RELAYS] })
  })

  it('opens tags on the site and seeks with a query for timestamps', () => {
    expect(links.hashtag('travel')).toEqual({ to: '/t/travel' })
    expect(links.hashtag('c#')).toEqual({ to: '/t/c%23' })
    expect(links.timestamp('naddr1xyz', 83.9)).toEqual({ to: '/v/naddr1xyz?t=83' })
  })

  it('opens the creator’s own videos on the site', () => {
    const own = nip19.naddrEncode({ kind: 34235, pubkey: CREATOR, identifier: 'intro' })
    expect(links.event?.({ nip19: own, kind: 34235, pubkey: CREATOR, relays: [] })).toEqual({
      to: `/v/${own}`,
    })
  })

  it('sends other videos and notes out with the instance relays as hints', () => {
    const video = links.event?.({
      nip19: nip19.naddrEncode({ kind: 34235, pubkey: OTHER, identifier: 'x' }),
      kind: 34235,
      pubkey: OTHER,
      relays: [],
    })
    expect(entity(video as { href?: string })).toMatchObject({
      type: 'naddr',
      data: { pubkey: OTHER, identifier: 'x', relays: INSTANCE_RELAYS },
    })

    // A note becomes a nevent that names where to read it; existing hints survive.
    const note = links.event?.({
      nip19: nip19.noteEncode('c'.repeat(64)),
      id: 'c'.repeat(64),
      relays: [],
    })
    expect(entity(note as { href?: string })).toMatchObject({
      type: 'nevent',
      data: { id: 'c'.repeat(64), relays: INSTANCE_RELAYS },
    })
  })
})

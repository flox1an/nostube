import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_LINKS, type InstanceConfig } from '@nostube/core/instance-config'
import { siteLinks } from './site-links'

const CREATOR = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const config = {
  creators: [CREATOR],
  site: {
    tagline: '',
    theme: { accent: '#112233', font: 'sans' },
    videos: { hidden: [] },
    links: { ...DEFAULT_SITE_LINKS, profile: 'https://people.example/{nip19}' },
  },
} as unknown as InstanceConfig
const links = siteLinks(config)

describe('siteLinks', () => {
  it('sends the creator home and everyone else to the configured viewer', () => {
    expect(links.profile({ pubkey: CREATOR, relays: [] })).toEqual({ to: '/' })
    expect(links.profile({ pubkey: OTHER, relays: ['wss://private.lan'] })).toEqual({
      href: `https://people.example/${nip19.npubEncode(OTHER)}`,
    })
  })

  it('has no page for tags and seeks with a query for timestamps', () => {
    expect(links.hashtag('travel')).toBeNull()
    expect(links.timestamp('naddr1xyz', 83.9)).toEqual({ to: '/v/naddr1xyz?t=83' })
  })

  it('opens the creator’s own videos on the site', () => {
    const own = nip19.naddrEncode({ kind: 34235, pubkey: CREATOR, identifier: 'intro' })
    expect(links.event?.({ nip19: own, kind: 34235, pubkey: CREATOR, relays: [] })).toEqual({
      to: `/v/${own}`,
    })
  })

  it('sends other videos and notes to the configured viewers', () => {
    const video = nip19.naddrEncode({ kind: 34235, pubkey: OTHER, identifier: 'x' })
    expect(links.event?.({ nip19: video, kind: 34235, pubkey: OTHER, relays: [] })).toEqual({
      href: `https://nostu.be/v/${video}`,
    })
    const note = nip19.noteEncode('c'.repeat(64))
    expect(links.event?.({ nip19: note, id: 'c'.repeat(64), relays: [] })).toEqual({
      href: `https://njump.me/${note}`,
    })
  })
})

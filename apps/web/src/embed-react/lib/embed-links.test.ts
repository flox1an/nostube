import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_LINKS, type InstanceConfig } from '@nostube/core/instance-config'
import { embedLinks } from './embed-links'

const CREATOR = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const ORIGIN = 'https://videos.example.org'
const instance = {
  creators: [CREATOR],
  videoSources: ['wss://videos.example'],
  interactionRelays: ['wss://interact.example'],
  site: { links: { ...DEFAULT_SITE_LINKS, profile: 'https://people.example/{nip19}' } },
} as unknown as InstanceConfig
const decoded = (url: string) => nip19.decode(new URL(url).pathname.split('/').pop()!)

describe('embedLinks', () => {
  it('points at nostu.be on nostube', () => {
    const links = embedLinks({ videoId: 'nevent1abc', authorPubkey: CREATOR, onInstance: false })
    expect(links.watchUrl).toMatch(/^https:\/\/nostu\.be\/.*nevent1abc/)
    expect(links.profileUrl).toMatch(/^https:\/\/nostu\.be\//)
    expect(links.watchLabel).toBe('Open on nostube')
  })

  it("points into the instance's own site for the creator's video, and never names nostube", () => {
    const links = embedLinks({
      videoId: 'naddr1abc',
      authorPubkey: CREATOR,
      instance,
      onInstance: true,
      origin: ORIGIN,
    })
    expect(links.watchUrl).toBe(`${ORIGIN}/v/naddr1abc`)
    expect(links.profileUrl).toBe(`${ORIGIN}/`)
    expect(JSON.stringify(links).toLowerCase()).not.toMatch(/nostu|nostube/)
  })

  it("sends another author's video where the creator chose, with the instance relays as hints", () => {
    const links = embedLinks({
      videoId: nip19.naddrEncode({ kind: 34235, pubkey: OTHER, identifier: 'x' }),
      authorPubkey: OTHER,
      instance,
      onInstance: true,
      origin: ORIGIN,
    })
    expect(decoded(links.watchUrl)).toMatchObject({
      type: 'naddr',
      data: {
        pubkey: OTHER,
        identifier: 'x',
        relays: ['wss://interact.example', 'wss://videos.example'],
      },
    })
    expect(decoded(links.profileUrl)).toMatchObject({
      type: 'nprofile',
      data: { pubkey: OTHER, relays: ['wss://interact.example', 'wss://videos.example'] },
    })
  })

  it('falls back to the own site when the config could not be read', () => {
    const links = embedLinks({
      videoId: 'naddr1abc',
      authorPubkey: OTHER,
      instance: null,
      onInstance: true,
      origin: ORIGIN,
    })
    expect(links.watchUrl).toBe(`${ORIGIN}/v/naddr1abc`)
    expect(links.watchLabel).toBe('Watch on the site')
  })
})

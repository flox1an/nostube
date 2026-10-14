import { describe, expect, it, vi } from 'vitest'
import { nip19 } from 'nostr-tools'
import { routeForKind, routeNostrUri } from './nostr-handler'

const pubkey = 'a'.repeat(64)
const id = 'b'.repeat(64)
const npub = nip19.npubEncode(pubkey)
const nprofile = nip19.nprofileEncode({ pubkey, relays: ['wss://relay.example'] })
const note = nip19.noteEncode(id)
const nevent = (kind?: number) => nip19.neventEncode({ id, kind, relays: ['wss://relay.example'] })
const naddr = (kind: number) => nip19.naddrEncode({ kind, pubkey, identifier: 'vid' })

describe('routeNostrUri', () => {
  it('opens profiles for npub and nprofile', () => {
    expect(routeNostrUri(`web+nostr:${npub}`)).toEqual({ type: 'navigate', to: `/p/${npub}` })
    expect(routeNostrUri(`web+nostr:${nprofile}`)).toEqual({
      type: 'navigate',
      to: `/p/${nprofile}`,
    })
  })

  it('accepts nostr: and bare identifiers too', () => {
    expect(routeNostrUri(`nostr:${npub}`)).toEqual({ type: 'navigate', to: `/p/${npub}` })
    expect(routeNostrUri(npub)).toEqual({ type: 'navigate', to: `/p/${npub}` })
  })

  it.each([21, 34235])('opens the video page for nevent and naddr of kind %i', kind => {
    expect(routeNostrUri(`web+nostr:${nevent(kind)}`)).toEqual({
      type: 'navigate',
      to: `/v/${nevent(kind)}`,
    })
    expect(routeNostrUri(`web+nostr:${naddr(kind)}`)).toEqual({
      type: 'navigate',
      to: `/v/${naddr(kind)}`,
    })
  })

  it.each([22, 34236])('opens the shorts page for nevent and naddr of kind %i', kind => {
    expect(routeNostrUri(`web+nostr:${nevent(kind)}`)).toEqual({
      type: 'navigate',
      to: `/short/${nevent(kind)}`,
    })
    expect(routeNostrUri(`web+nostr:${naddr(kind)}`)).toEqual({
      type: 'navigate',
      to: `/short/${naddr(kind)}`,
    })
  })

  it('sends non-video events to njump.me', () => {
    expect(routeNostrUri(`web+nostr:${nevent(1)}`)).toEqual({
      type: 'external',
      url: `https://njump.me/${nevent(1)}`,
    })
    expect(routeNostrUri(`web+nostr:${naddr(30023)}`)).toEqual({
      type: 'external',
      url: `https://njump.me/${naddr(30023)}`,
    })
  })

  it('loads note and kind-less nevent identifiers before routing', () => {
    expect(routeNostrUri(`web+nostr:${note}`)).toEqual({
      type: 'load',
      identifier: note,
      pointer: { id },
    })
    expect(routeNostrUri(`web+nostr:${nevent()}`)).toMatchObject({
      type: 'load',
      identifier: nevent(),
      pointer: { id, relays: ['wss://relay.example'] },
    })
  })

  it('rejects invalid identifiers and never forwards a secret key', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(routeNostrUri('')).toEqual({ type: 'invalid' })
    expect(routeNostrUri('web+nostr:')).toEqual({ type: 'invalid' })
    expect(routeNostrUri('web+nostr:garbage')).toEqual({ type: 'invalid' })
    expect(routeNostrUri(`web+nostr:${nip19.nsecEncode(new Uint8Array(32).fill(1))}`)).toEqual({
      type: 'invalid',
    })
    vi.restoreAllMocks()
  })
})

describe('routeForKind (after loading the event)', () => {
  it('routes a loaded video or short by its kind', () => {
    expect(routeForKind(note, 21)).toEqual({ type: 'navigate', to: `/v/${note}` })
    expect(routeForKind(note, 22)).toEqual({ type: 'navigate', to: `/short/${note}` })
  })

  it('sends other kinds and events that could not be loaded to njump.me', () => {
    expect(routeForKind(note, 1)).toEqual({ type: 'external', url: `https://njump.me/${note}` })
    expect(routeForKind(note, undefined)).toEqual({
      type: 'external',
      url: `https://njump.me/${note}`,
    })
  })
})

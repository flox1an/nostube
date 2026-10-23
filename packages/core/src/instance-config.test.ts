import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SIGNER_RELAYS,
  DEFAULT_SITE_LINKS,
  allowSignerRelays,
  fillLinkTemplate,
  decideLoad,
  isRelayAllowed,
  instanceSignerName,
  instanceSignerRelays,
  parseInstanceConfig,
  scopeVideoRequest,
  setInstanceConfig,
  noSitePages,
  pageText,
  SITE_PAGE_MAX_CHARS,
  noSiteHomepage,
  type InstanceConfig,
} from './instance-config'

const CREATOR = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const RELAY = 'wss://studio.local'

const good = (): InstanceConfig => ({
  version: 1,
  revision: 3,
  origin: 'https://studio.local',
  title: "Flox's videos",
  creators: [CREATOR],
  startPage: { kind: 'creator-profile', creator: CREATOR },
  videoSources: [RELAY],
  interactionRelays: [RELAY],
  profileRelays: [],
  signerRelays: [],
  search: { mode: 'local' },
  site: {
    tagline: 'Hello',
    theme: { accent: '#ff8800', font: 'serif' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: { about: { en: 'About us', de: 'Über uns' }, imprint: {}, privacy: {} },
  },
})

describe('site link templates', () => {
  it('fill the identifier in', () => {
    expect(fillLinkTemplate('https://x.example/{nip19}/{nip19}', 'npub1abc')).toBe(
      'https://x.example/npub1abc/npub1abc'
    )
  })
})

describe('parseInstanceConfig site', () => {
  const withSite = (site: unknown) => parseInstanceConfig({ ...good(), site })

  it('requires the site object', () => {
    const { site: _site, ...body } = good()
    const result = parseInstanceConfig(body)
    expect(!result.ok && result.errors).toContain('site is missing')
  })

  it('accepts hidden addresses and event ids', () => {
    const hidden = [`34235:${CREATOR}:intro`, 'c'.repeat(64)]
    expect(withSite({ ...good().site, videos: { hidden } }).ok).toBe(true)
  })

  it.each([
    ['accent', { theme: { accent: 'red', font: 'sans' } }],
    ['font', { theme: { accent: '#112233', font: 'comic' } }],
    ['tagline', { tagline: 3 }],
    ['hidden', { videos: { hidden: ['nope'] } }],
    ['hidden missing', { videos: {} }],
    ['link over http', { links: { ...good().site.links, profile: 'http://x.example/{nip19}' } }],
    ['link without placeholder', { links: { ...good().site.links, note: 'https://x.example/' } }],
    ['links missing', { links: undefined }],
  ])('rejects an invalid %s', (_name, patch) => {
    expect(withSite({ ...good().site, ...patch }).ok).toBe(false)
  })

  it('keeps the branding URLs of this server and ignores foreign or invalid ones', () => {
    const result = withSite({
      ...good().site,
      logo: '/branding/logo?v=0123456789abcdef',
      favicon: 'https://evil.example/branding/favicon',
      banner: '/branding/logo?v=0123456789abcdef',
      icon: '/branding/icon?v=fedcba9876543210',
    })
    expect(result.ok && result.config.site).toEqual({
      ...good().site,
      logo: '/branding/logo?v=0123456789abcdef',
      icon: '/branding/icon?v=fedcba9876543210',
    })
    expect(withSite({ ...good().site, logo: 42, banner: '//evil.example/x' }).ok).toBe(true)
  })

  it('keeps the page texts, and reads a config without pages as no pages', () => {
    const pages = { about: { en: 'About', de: 'Über' }, imprint: {}, privacy: { fr: 'Vie privée' } }
    const kept = withSite({ ...good().site, pages })
    expect(kept.ok && kept.config.site.pages).toEqual(pages)
    const { pages: _pages, ...old } = good().site
    const absent = withSite(old)
    expect(absent.ok && absent.config.site.pages).toEqual(noSitePages())
    // A page the config leaves out is an empty one.
    const partial = withSite({ ...good().site, pages: { about: { en: 'About' } } })
    expect(partial.ok && partial.config.site.pages).toEqual({
      about: { en: 'About' },
      imprint: {},
      privacy: {},
    })
  })

  it.each([
    ['pages as a list', []],
    ['a page as a string', { about: 'text' }],
    ['a language that is not two letters', { about: { deu: 'Über' } }],
    ['an uppercase language', { about: { DE: 'Über' } }],
    ['an empty text', { imprint: { en: '  ' } }],
    ['a text that is not a string', { privacy: { en: 3 } }],
    ['a text over the limit', { about: { en: 'x'.repeat(SITE_PAGE_MAX_CHARS + 1) } }],
  ])('rejects %s', (_name, pages) => {
    expect(withSite({ ...good().site, pages }).ok).toBe(false)
  })
})

describe('homepage configuration', () => {
  const homepage = {
    ...noSiteHomepage(),
    intro: 'Films by Alice',
    featured: `34235:${CREATOR}:debut:director-cut`,
    featuredText: 'Start with my first film.',
    selected: ['c'.repeat(64), `34236:${CREATOR}:backstage`],
    links: [{ label: 'Concerts', url: 'https://alice.example/concerts' }],
    action: { label: 'Book a screening', url: 'https://alice.example/contact' },
  }

  it('retains the creator’s ordered choices and named links when loading the public config', () => {
    const result = parseInstanceConfig({
      ...good(),
      site: { ...good().site, homepage },
    })
    expect(result.ok && result.config.site.homepage).toEqual(homepage)
  })

  it.each([
    ['script action', { action: { label: 'Watch', url: 'javascript:alert(1)' } }],
    [
      'credentials in a link',
      { links: [{ label: 'Shop', url: 'https://user:secret@shop.example' }] },
    ],
    ['foreign event kind', { featured: `30023:${CREATOR}:article` }],
    ['control character in a reference', { selected: [`34235:${CREATOR}:film\u0085cut`] }],
    ['duplicate selections', { selected: ['c'.repeat(64), 'c'.repeat(64)] }],
    ['oversized introduction', { intro: '🎬'.repeat(2001) }],
    ['incomplete object', { action: undefined }],
  ])('rejects %s before the site renders it', (_name, patch) => {
    const result = parseInstanceConfig({
      ...good(),
      site: { ...good().site, homepage: { ...homepage, ...patch } },
    })
    expect(result.ok).toBe(false)
  })
})

describe('pageText', () => {
  it('prefers the visitor’s language, then English, then the first language by code', () => {
    expect(pageText({ de: 'Hallo', en: 'Hello' }, 'de')).toBe('Hallo')
    expect(pageText({ de: 'Hallo', en: 'Hello' }, 'fr')).toBe('Hello')
    expect(pageText({ ja: 'こんにちは', de: 'Hallo' }, 'fr')).toBe('Hallo')
    expect(pageText({}, 'en')).toBeUndefined()
  })
})

describe('parseInstanceConfig', () => {
  it('accepts a valid v1 config and ignores unknown fields', () => {
    expect(parseInstanceConfig({ ...good(), future: true })).toEqual({ ok: true, config: good() })
  })

  it('rejects a config with a missing field', () => {
    const { search: _search, ...body } = good()
    const result = parseInstanceConfig(body)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toContain('search is missing')
  })

  it('allows empty lists (none on purpose) with startPage null', () => {
    const body = {
      ...good(),
      creators: [],
      startPage: null,
      videoSources: [],
      interactionRelays: [],
    }
    expect(parseInstanceConfig(body).ok).toBe(true)
  })

  it('rejects a startPage creator that is not a displayed creator', () => {
    const body = { ...good(), startPage: { kind: 'creator-profile', creator: OTHER } }
    expect(parseInstanceConfig(body)).toMatchObject({ ok: false, kind: 'invalid' })
  })

  it('rejects an unknown contract version', () => {
    expect(parseInstanceConfig({ ...good(), version: 2 })).toMatchObject({
      ok: false,
      kind: 'unsupported-version',
    })
  })

  it('accepts an http origin with its ws relay (mesh instance)', () => {
    const relay = 'ws://npub1abc.fips:8080'
    const result = parseInstanceConfig({
      ...good(),
      origin: 'http://npub1abc.fips:8080',
      videoSources: [relay],
      interactionRelays: [relay],
    })
    expect(result.ok && result.config.origin).toBe('http://npub1abc.fips:8080')
  })

  it('rejects an origin with path, query, credentials or other scheme, and external search', () => {
    for (const origin of [
      'https://studio.local/app',
      'https://studio.local?x=1',
      'https://studio.local#x',
      'http://user@studio.local',
      'ftp://studio.local',
      'wss://studio.local',
    ])
      expect(parseInstanceConfig({ ...good(), origin }).ok).toBe(false)
    expect(
      parseInstanceConfig({ ...good(), search: { mode: 'external', url: 'https://x.example' } }).ok
    ).toBe(false)
  })

  it('reads profileRelays: absent keeps the public defaults, empty stays empty', () => {
    const { profileRelays: _p, ...oldServer } = good()
    const absent = parseInstanceConfig(oldServer)
    expect(absent.ok && absent.config.profileRelays).toEqual(DEFAULT_PROFILE_RELAYS)
    const empty = parseInstanceConfig({ ...good(), profileRelays: [] })
    expect(empty.ok && empty.config.profileRelays).toEqual([])
    expect(parseInstanceConfig({ ...good(), profileRelays: ['https://x.example'] }).ok).toBe(false)
    expect(parseInstanceConfig({ ...good(), profileRelays: null }).ok).toBe(false)
  })
})

describe('instance remote signer configuration', () => {
  it('adds public rendezvous for old servers but preserves an explicitly empty list', () => {
    const { signerRelays: _s, ...oldServer } = good()
    const absent = parseInstanceConfig(oldServer)
    expect(absent.ok && absent.config.signerRelays).toEqual(DEFAULT_SIGNER_RELAYS)
    const empty = parseInstanceConfig(good())
    expect(empty.ok && instanceSignerRelays(empty.config)).toEqual([RELAY])
  })

  it('pairs over configured public relays as well as the mesh without adding catalog sources', () => {
    const mesh = 'ws://npub1mesh.fips'
    const config = {
      ...good(),
      videoSources: [mesh],
      interactionRelays: [mesh, 'wss://shared.example'],
      signerRelays: ['wss://public.example', 'wss://shared.example'],
    }
    const pairing = instanceSignerRelays(config)
    expect(pairing).toEqual(['wss://public.example', 'wss://shared.example', mesh])
    expect(scopeVideoRequest(config, pairing, [{ kinds: [34235] }])).toEqual({
      relays: [mesh],
      filters: [{ kinds: [34235], authors: [CREATOR] }],
    })
  })

  it('distinguishes equally named instances by their canonical host and port', () => {
    const config = { ...good(), title: 'My videos', origin: 'http://npub1mesh.fips' }
    expect(instanceSignerName(config)).toBe('My videos (npub1mesh.fips)')
    expect(instanceSignerName({ ...config, origin: 'http://npub1other.fips:8080' })).toBe(
      'My videos (npub1other.fips:8080)'
    )
  })

  it.each([
    'https://relay.example',
    'ws://',
    'wss://user:secret@relay.example',
    'wss://relay.example#fragment',
    'wss://relay.example?token=secret',
    'wss://relay.example/path',
    'wss://relay.example:invalid',
  ])('rejects invalid or credential-bearing signer relay: %j', relay => {
    expect(parseInstanceConfig({ ...good(), signerRelays: [relay] }).ok).toBe(false)
  })
})

describe('decideLoad', () => {
  it('runs a valid config', () => {
    expect(decideLoad({ kind: 'http', status: 200, body: good() }, null)).toEqual({
      mode: 'run',
      config: good(),
      stale: false,
    })
  })

  it('runs the last good config on 5xx or network error', () => {
    const lastGood = good()
    expect(decideLoad({ kind: 'http', status: 503 }, lastGood)).toEqual({
      mode: 'run',
      config: lastGood,
      stale: true,
    })
    expect(decideLoad({ kind: 'network-error' }, lastGood).mode).toBe('run')
  })

  it('shows the retry screen on 5xx without a last good config', () => {
    expect(decideLoad({ kind: 'http', status: 502 }, null).mode).toBe('retry')
  })

  it('shows the error screen on 404, even with a last good config', () => {
    expect(decideLoad({ kind: 'http', status: 404 }, good()).mode).toBe('error')
  })

  it('shows the error screen on an invalid body', () => {
    expect(decideLoad({ kind: 'http', status: 200, body: { version: 1 } }, good()).mode).toBe(
      'error'
    )
  })
})

describe('scopeVideoRequest', () => {
  const deletion = { kinds: [5], authors: [OTHER] }

  it('restricts video queries to creators and video sources', () => {
    expect(
      scopeVideoRequest(good(), [RELAY, 'wss://relay.primal.net'], [{ kinds: [21], limit: 50 }])
    ).toEqual({ relays: [RELAY], filters: [{ kinds: [21], limit: 50, authors: [CREATOR] }] })
  })

  it('sends nothing for a non-creator author page', () => {
    expect(scopeVideoRequest(good(), [RELAY], [{ kinds: [21], authors: [OTHER] }, deletion])).toBe(
      null
    )
  })

  it('leaves non-video requests alone', () => {
    const relays = ['wss://anywhere']
    expect(scopeVideoRequest(good(), relays, [deletion])).toEqual({ relays, filters: [deletion] })
  })
})

describe('allowSignerRelays', () => {
  it('accepts bunker and wallet relays alongside the configured instance relays', () => {
    setInstanceConfig(good())
    try {
      expect(isRelayAllowed('wss://relay.getalby.com')).toBe(false)
      allowSignerRelays(['wss://relay.getalby.com', 'wss://Bunker.example'])
      expect(isRelayAllowed('wss://relay.getalby.com')).toBe(true)
      // normalizeURL comparison: trailing slash variants hit the same entry
      expect(isRelayAllowed('wss://bunker.example/')).toBe(true)
      expect(isRelayAllowed('wss://still-not-allowed.example')).toBe(false)
      expect(isRelayAllowed(RELAY)).toBe(true)
    } finally {
      setInstanceConfig(null as unknown as InstanceConfig)
    }
  })

  it('is a no-op outside the instance build', () => {
    setInstanceConfig(null as unknown as InstanceConfig)
    expect(isRelayAllowed('wss://anything.example')).toBe(true)
    allowSignerRelays(['wss://relay.getalby.com'])
    expect(isRelayAllowed('wss://anything.example')).toBe(true)
  })
})

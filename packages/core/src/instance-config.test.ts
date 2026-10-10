import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SITE_LINKS,
  allowSignerRelays,
  fillLinkTemplate,
  decideLoad,
  isRelayAllowed,
  parseInstanceConfig,
  scopeVideoRequest,
  setInstanceConfig,
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
  search: { mode: 'local' },
  site: {
    tagline: 'Hello',
    theme: { accent: '#ff8800', font: 'serif' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
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
    })
    expect(result.ok && result.config.site).toEqual({
      ...good().site,
      logo: '/branding/logo?v=0123456789abcdef',
    })
    expect(withSite({ ...good().site, logo: 42, banner: '//evil.example/x' }).ok).toBe(true)
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

  it('rejects an origin with a path and an empty external search url', () => {
    expect(parseInstanceConfig({ ...good(), origin: 'https://studio.local/app' }).ok).toBe(false)
    expect(parseInstanceConfig({ ...good(), search: { mode: 'external', url: '' } }).ok).toBe(false)
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

import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SITE_LINKS,
  SITE_PAGE_MAX_CHARS,
  noSiteHomepage,
  type SiteHomepage,
} from '@nostube/core/instance-config'
import { nip19 } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import type { AdminConfig } from './api'
import i18n from './i18n'
import {
  LINK_PRESETS,
  fromDraft,
  isKeyConnected,
  isLightningAddress,
  needsRestart,
  isRefHidden,
  linkPresetOf,
  setRefHidden,
  toDraft,
  draftCanBePublic,
  type Draft,
} from './draft'

const PK = 'a'.repeat(64)
const config: AdminConfig = {
  title: 'Flox',
  creators: [PK],
  allowedWriters: [PK],
  videoSources: ['wss://relay.example'],
  interactionRelays: [],
  profileRelays: DEFAULT_PROFILE_RELAYS,
  reach: 'public',
  siteHosting: 'instance',
  nsite: { gateway: 'nsite.lol', domain: '' },
  mirror: { relays: [], blossom: [] },
  search: { mode: 'off' },
  storage: { quotaGib: 0, freeSpaceReserveGib: 5, s3: null },
  site: {
    tagline: 'Hi',
    theme: { accent: '#6d28d9', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: { about: { en: 'About', de: 'Über uns' }, imprint: {}, privacy: {} },
    lightning: 'flox@getalby.com',
    countPlays: false,
  },
}

describe('draft', () => {
  it('round-trips a config unchanged', () => {
    const result = fromDraft(toDraft(config))
    expect(result.config).toEqual(config)
  })

  it('round-trips nsite settings and turns hosting off with private reach', () => {
    const hosted: AdminConfig = {
      ...config,
      siteHosting: 'nsite',
      nsite: { gateway: 'gateway.example', domain: 'videos.example' },
    }
    expect(fromDraft(toDraft(hosted)).config).toEqual(hosted)
    expect(fromDraft({ ...toDraft(hosted), reach: 'private' }).config?.siteHosting).toBe('instance')
    expect(
      fromDraft({ ...toDraft(hosted), nsiteGateway: 'https://gateway.example/path' }).config
    ).toBeNull()
    for (const host of [
      'gateway.example.',
      'gateway.123',
      'gateway.local',
      '127.0.0.1',
      'https://gateway.example',
      'gateway.example:443',
    ]) {
      expect(fromDraft({ ...toDraft(hosted), nsiteGateway: host }).config, host).toBeNull()
    }
  })

  it('requires publicly reachable draft mirrors for public reach without a public origin', () => {
    const base = toDraft(config)
    expect(draftCanBePublic(true, base)).toBe(true)
    expect(draftCanBePublic(false, base)).toBe(false)
    const mirrors = {
      ...base,
      mirrorRelaysText: 'ws://relay.example',
      mirrorBlossomText: 'http://blossom.example',
    }
    expect(draftCanBePublic(false, mirrors)).toBe(true)
    expect(fromDraft(mirrors, false).config?.reach).toBe('public')
    expect(fromDraft({ ...mirrors, mirrorRelaysText: '' }, false).config).toBeNull()
    expect(fromDraft({ ...mirrors, mirrorBlossomText: '' }, false).config).toBeNull()
    for (const target of [
      'https://127.0.0.1',
      'https://[::1]',
      'https://home.local',
      'https://localhost',
      'https://user@blossom.example',
    ]) {
      expect(draftCanBePublic(false, { ...mirrors, mirrorBlossomText: target }), target).toBe(false)
    }
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

  it('saves an emptied additional profile relay list as empty, not as the defaults', () => {
    const result = fromDraft({ ...toDraft(config), profileRelaysText: '  \n' })
    expect(result.config?.profileRelays).toEqual([])
    expect(fromDraft(toDraft(result.config!)).config).toEqual(result.config)
  })

  it('keeps the mirror targets and lets both lists be emptied (off)', () => {
    const on = fromDraft({
      ...toDraft(config),
      mirrorRelaysText: 'wss://mirror.example\n',
      mirrorBlossomText: 'https://blossom.example/',
    })
    expect(on.config?.mirror).toEqual({
      relays: ['wss://mirror.example'],
      blossom: ['https://blossom.example/'],
    })
    const off = fromDraft({ ...toDraft(on.config!), mirrorRelaysText: '', mirrorBlossomText: ' ' })
    expect(off.config?.mirror).toEqual({ relays: [], blossom: [] })
  })

  it.each([
    ['mirror relay', { mirrorRelaysText: 'https://relay.example' }],
    ['mirror Blossom server', { mirrorBlossomText: 'wss://blossom.example' }],
  ])('rejects a %s that is not an address of its kind', (_name, change) => {
    expect(fromDraft({ ...toDraft(config), ...change }).config).toBeNull()
  })

  it.each([
    ['title', { title: '  ' }],
    ['accent', { accent: 'red' }],
    ['creator', { creatorsText: 'nope' }],
    ['relay', { videoSourcesText: 'https://relay.example' }],
    ['profile relay', { profileRelaysText: 'purplepag.es' }],
    ['hidden video', { hiddenText: 'not a video' }],
    [
      'link without a placeholder',
      { links: { ...DEFAULT_SITE_LINKS, note: 'https://example.org/' } },
    ],
    ['link over http', { links: { ...DEFAULT_SITE_LINKS, profile: 'http://example.org/{nip19}' } }],
    ['quota', { quota: '-1' }],
    ['lightning address', { lightning: 'flox at getalby' }],
    [
      'page text over the limit',
      {
        pages: {
          ...toDraft(config).pages,
          privacy: { en: 'x'.repeat(SITE_PAGE_MAX_CHARS + 1) },
        },
      },
    ],
  ])('reports an invalid %s and builds nothing', (_name, patch) => {
    const result = fromDraft({ ...toDraft(config), ...patch })
    expect(result.config).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('drops the languages left empty, trims the texts, and is rid of a page with none left', () => {
    const result = fromDraft({
      ...toDraft(config),
      pages: {
        about: { en: '  About  ', de: '   ' },
        imprint: { fr: '' },
        privacy: { ja: 'x' },
      },
    })
    expect(result.config?.site.pages).toEqual({
      about: { en: 'About' },
      imprint: {},
      privacy: { ja: 'x' },
    })
  })

  it('checks a Lightning address like the server and saves it trimmed', () => {
    expect(['', 'a@b.co'].every(isLightningAddress)).toBe(true)
    for (const bad of ['flox', 'a@localhost', 'a b@c.d', 'a@b@c.d', `a@${'b'.repeat(250)}.co`]) {
      expect(isLightningAddress(bad)).toBe(false)
    }
    expect(fromDraft({ ...toDraft(config), lightning: ' x@y.z ' }).config?.site.lightning).toBe(
      'x@y.z'
    )
  })

  it('needs a restart only for writers, storage and mirror changes', () => {
    const edit = (patch: Partial<Draft>) => fromDraft({ ...toDraft(config), ...patch }).config!
    expect(needsRestart(config, edit({ title: 'New', lightning: '', creatorsText: '' }))).toBe(
      false
    )
    expect(needsRestart(config, edit({ videoSourcesText: 'wss://other.example' }))).toBe(false)
    expect(needsRestart(config, edit({ writersText: '' }))).toBe(true)
    expect(needsRestart(config, edit({ quota: '10' }))).toBe(true)
    expect(needsRestart(config, edit({ reserve: '1' }))).toBe(true)
    expect(needsRestart(config, edit({ mirrorRelaysText: 'wss://mirror.example' }))).toBe(true)
    expect(needsRestart(config, edit({ mirrorBlossomText: 'https://b.example' }))).toBe(true)
  })
})

describe('S3 storage draft', () => {
  const s3 = {
    endpoint: 'https://acc.r2.cloudflarestorage.com',
    bucket: 'videos',
    region: 'auto',
    forcePathStyle: false,
    accessKeyId: 'AKID',
    secretSet: true,
  }
  const withS3: AdminConfig = { ...config, storage: { ...config.storage, s3 } }
  const fresh: Partial<Draft> = {
    storageKind: 's3',
    s3Endpoint: ' http://minio.lan:9000 ',
    s3Bucket: 'b',
    s3AccessKey: 'k',
    s3Secret: 'shh',
    s3PathStyle: true,
  }

  it('round-trips the saved settings without a secret and keeps the stored one', () => {
    const draft = toDraft(withS3)
    expect(draft.s3Secret).toBe('')
    expect(draft.s3SecretSet).toBe(true)
    expect(fromDraft(draft).config).toEqual(withS3)
    expect(fromDraft(draft).config!.storage.s3).not.toHaveProperty('secretAccessKey')
  })

  it('sends a typed secret, saves an empty region as auto', () => {
    expect(fromDraft({ ...toDraft(config), ...fresh }).config!.storage.s3).toEqual({
      endpoint: 'http://minio.lan:9000',
      bucket: 'b',
      region: 'auto',
      forcePathStyle: true,
      accessKeyId: 'k',
      secretSet: false,
      secretAccessKey: 'shh',
    })
  })

  it.each([
    ['endpoint without scheme', { s3Endpoint: 'minio.lan' }, /endpoint/],
    ['endpoint with another scheme', { s3Endpoint: 'ftp://minio.lan' }, /endpoint/],
    ['malformed endpoint', { s3Endpoint: 'https://:' }, /endpoint/],
    ['empty bucket', { s3Bucket: ' ' }, /bucket name/],
    ['empty access key', { s3AccessKey: '' }, /access key ID/],
    ['no secret when enabling fresh', { s3Secret: '' }, /secret access key/],
  ])('rejects %s', async (_name, patch, message) => {
    await i18n.changeLanguage('en')
    const result = fromDraft({ ...toDraft(config), ...fresh, ...patch })
    expect(result.config).toBeNull()
    expect(result.errors.join('\n')).toMatch(message)
  })

  it('restarts for any S3 change, a new secret alone included', () => {
    const edit = (patch: Partial<Draft>) => fromDraft({ ...toDraft(withS3), ...patch }).config!
    expect(needsRestart(withS3, edit({}))).toBe(false)
    expect(needsRestart(config, edit({}))).toBe(true)
    expect(needsRestart(withS3, edit({ s3Bucket: 'other' }))).toBe(true)
    expect(needsRestart(withS3, edit({ s3PathStyle: true }))).toBe(true)
    expect(needsRestart(withS3, edit({ s3Secret: 'new' }))).toBe(true)
  })
})

describe('homepage', () => {
  const homepage: SiteHomepage = {
    intro: 'Hello',
    featured: `34235:${PK}:intro:with:colons`,
    featuredText: 'Start here',
    selected: ['b'.repeat(64), `34236:${PK}:short`],
    links: [{ label: 'Shop', url: 'https://shop.example/' }],
    action: { label: 'Support me', url: 'https://support.example/' },
  }
  const curated: AdminConfig = { ...config, site: { ...config.site, homepage } }

  it('keeps a config without a homepage without one, and starts its editor empty', () => {
    expect(toDraft(config).homepage).toBeUndefined()
    expect(fromDraft(toDraft(config)).config?.site).not.toHaveProperty('homepage')
  })

  it('saves a curated homepage unchanged, in its order', () => {
    expect(fromDraft(toDraft(curated)).config?.site.homepage).toEqual(homepage)
    const reordered = { ...homepage, selected: [...homepage.selected].reverse() }
    expect(fromDraft({ ...toDraft(curated), homepage: reordered }).config?.site.homepage).toEqual(
      reordered
    )
  })

  it('trims the texts and drops link rows and a main button left empty', () => {
    const result = fromDraft({
      ...toDraft(curated),
      homepage: {
        ...homepage,
        intro: '  Hello \n',
        featuredText: ' Start here ',
        links: [
          { label: ' Shop ', url: ' https://shop.example/ ' },
          { label: ' ', url: '' },
        ],
        action: { label: ' ', url: ' ' },
      },
    })
    expect(result.config?.site.homepage).toEqual({ ...homepage, action: null })
  })

  it('saves a cleared homepage as empty, not as absent', () => {
    expect(
      fromDraft({ ...toDraft(curated), homepage: noSiteHomepage() }).config?.site.homepage
    ).toEqual(noSiteHomepage())
  })

  it.each([
    ['link over http', { links: [{ label: 'Shop', url: 'http://shop.example/' }] }, 'link'],
    ['link without a name', { links: [{ label: '', url: 'https://shop.example/' }] }, 'link'],
    ['main button with a relative address', { action: { label: 'Go', url: '/go' } }, 'link'],
    ['intro over the limit', { intro: 'x'.repeat(2001) }, 'intro'],
    ['video that is no reference', { selected: ['not a video'] }, 'videos'],
  ])('reports a %s in words and builds nothing', (_name, patch, message) => {
    const result = fromDraft({ ...toDraft(config), homepage: { ...noSiteHomepage(), ...patch } })
    expect(result.config).toBeNull()
    expect(result.errors).toContain(
      i18n.t(`studio.errors.homepage.${message}`, { intro: 2000, note: 500, selected: 12 })
    )
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

describe('a connected key', () => {
  const empty: AdminConfig = { ...config, creators: [], allowedWriters: [] }
  const KEY = 'b'.repeat(64)

  it('knows when a key still has to be connected', () => {
    expect(isKeyConnected(empty, KEY)).toBe(false)
    expect(isKeyConnected(config, null)).toBe(false)
    expect(isKeyConnected({ ...config, allowedWriters: [] }, PK)).toBe(false)
  })
})

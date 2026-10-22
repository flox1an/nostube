/**
 * Public instance config (contract v1, nostube-server ADR 0005).
 *
 * The site (`apps/site`) and the instance build (`VITE_INSTANCE_BUILD=true`, `npm run build:instance`)
 * load it. The instance build:
 * `src/instance-main.ts` fetches `/api/config` before any app module (relay pool, loaders)
 * is evaluated and calls `setInstanceConfig`. In the normal nostu.be build
 * `getInstanceConfig()` is always null and every instance branch is inert.
 */
import { normalizeURL } from 'applesauce-core/helpers'

export const INSTANCE_BUILD = import.meta.env.VITE_INSTANCE_BUILD === 'true'

export const CONTRACT_VERSION = 1
export const LAST_GOOD_CONFIG_KEY = 'nostube:instance-config'

/**
 * Page titles: `<page> - nostube`, or `<page> - <config.title>` in the instance build.
 * Read lazily: the instance boot script writes the last-good config right before the app
 * module graph is evaluated, so a module-load-time constant can race that write.
 */
export const appTitle = (): string => {
  if (!INSTANCE_BUILD) return 'nostube'
  try {
    const raw = localStorage.getItem(LAST_GOOD_CONFIG_KEY)
    if (!raw) return 'nostube'
    const parsed = parseInstanceConfig(JSON.parse(raw))
    return parsed.ok ? parsed.config.title : 'nostube'
  } catch {
    return 'nostube'
  }
}
export const pageTitle = (page: string | null | undefined) => {
  const title = appTitle()
  return page ? `${page} - ${title}` : title
}

/** `local`: the site searches the creators' catalog in the browser (`@nostube/core/video-search`). */
export type InstanceSearch = { mode: 'off' } | { mode: 'local' }

export const SITE_FONTS = ['sans', 'serif', 'mono'] as const
export type SiteFont = (typeof SITE_FONTS)[number]

/** The optional pages of the site, linked in its footer. */
export const SITE_PAGES = ['about', 'imprint', 'privacy'] as const
export type SitePageKey = (typeof SITE_PAGES)[number]

/** One text per language (`de`, `en`, ...), as the admin wrote it. */
export type SitePages = Record<SitePageKey, Record<string, string>>

export const SITE_PAGE_MAX_CHARS = 20_000
export const noSitePages = (): SitePages => ({ about: {}, imprint: {}, privacy: {} })
const PAGE_LANG = /^[a-z]{2}$/
export const isPageText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && [...v].length <= SITE_PAGE_MAX_CHARS

/** The text for the visitor's language, else English, else the first language by code. */
export const pageText = (texts: Record<string, string>, language: string): string | undefined =>
  texts[language] ?? texts.en ?? texts[Object.keys(texts).sort()[0]]

/** The creator's curated homepage; video choices use stable addresses or event ids. */
export interface SiteHomepage {
  intro: string
  featured: string
  featuredText: string
  selected: string[]
  links: { label: string; url: string }[]
  action: { label: string; url: string } | null
}

export const noSiteHomepage = (): SiteHomepage => ({
  intro: '',
  featured: '',
  featuredText: '',
  selected: [],
  links: [],
  action: null,
})

/** How the instance's site looks and which videos it shows (the viewer's light/dark follows the system). */
export interface InstanceSite {
  tagline: string
  theme: { accent: string; font: SiteFont }
  /** Everything of the creators is shown except these: `<kind>:<pubkey>:<d>` or an event id. */
  videos: { hidden: string[] }
  /**
   * Where links to Nostr content outside the site go (a mention of someone else, a video of
   * another creator, a note). Each is an https URL with `{nip19}` where the npub, nprofile,
   * naddr, nevent or note identifier goes.
   */
  links: { profile: string; video: string; note: string }
  /** The about, imprint and privacy texts; a page without any text does not exist. */
  pages: SitePages
  /** Absent on older instances: the chronological video grid remains the homepage. */
  homepage?: SiteHomepage
  /**
   * Images the admin uploaded (`/branding/<slot>?v=<hash>`, same origin); absent when the slot
   * is empty. Not part of the studio's config edit: the server adds them to the public config.
   */
  logo?: string
  favicon?: string
  banner?: string
  /** The square PNG (≥512×512) an installed site shows on the home screen. */
  icon?: string
}

export const BRANDING_SLOTS = ['logo', 'favicon', 'banner', 'icon'] as const
export type BrandingSlot = (typeof BRANDING_SLOTS)[number]

/** The URL the server gives a branding slot; anything else (another host, a path) is not used. */
export const isBrandingUrl = (slot: BrandingSlot, v: unknown): v is string =>
  typeof v === 'string' && new RegExp(`^/branding/${slot}\\?v=[0-9a-f]{1,64}$`).test(v)

export const SITE_LINK_KEYS = ['profile', 'video', 'note'] as const
export type SiteLinkKey = (typeof SITE_LINK_KEYS)[number]

/** The links an instance starts with: njump for people and notes, nostube for videos. */
export const DEFAULT_SITE_LINKS: InstanceSite['links'] = {
  profile: 'https://njump.me/{nip19}',
  video: 'https://nostu.be/v/{nip19}',
  note: 'https://njump.me/{nip19}',
}

/** True for an https URL with a `{nip19}` placeholder. */
export const isLinkTemplate = (v: unknown): v is string =>
  typeof v === 'string' && /^https:\/\/[^\s{}]+/.test(v) && v.includes('{nip19}') && !/\s/.test(v)

/** The URL for an identifier: the template with `{nip19}` replaced. */
export const fillLinkTemplate = (template: string, nip19: string) =>
  template.split('{nip19}').join(nip19)

/**
 * Public discovery relays always used for the signed-in visitor's own profile on the site.
 * The server also uses these as the default configured lookup relays.
 */
export const DEFAULT_PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://nos.lol',
  'wss://relay.damus.io',
]

/** Where the outbox mirrors an instance set up "into the Nostr network" (server ADR 0009). */
export const NETWORK_MIRROR_RELAYS = [
  'wss://relay.nostu.be',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

/** The app's default Blossom upload servers; also the mirror preset of a channel identity. */
export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.primal.net',
  'https://nostr.download',
  'https://almond.slidestr.net',
]

/**
 * Reach (nostube-server ADR 0012), an admin setting the Studio edits: `private` publishes nothing
 * and serves only this server's relay as video source and interaction relay; `public` publishes
 * the profile and relay list into the Nostr network. The site does not depend on it.
 */
export type Reach = 'private' | 'public'

export interface InstanceConfig {
  version: 1
  revision: number
  origin: string
  title: string
  creators: string[]
  startPage: { kind: 'creator-profile'; creator: string } | null
  videoSources: string[]
  interactionRelays: string[]
  /**
   * Additional lookup relays for the signed-in visitor, besides the mandatory public defaults.
   * Optional on the wire (absent: `DEFAULT_PROFILE_RELAYS`); empty: no additional relays.
   */
  profileRelays: string[]
  search: InstanceSearch
  site: InstanceSite
}

export type ParseResult =
  | { ok: true; config: InstanceConfig }
  | { ok: false; kind: 'invalid' | 'unsupported-version'; errors: string[] }

const REQUIRED = [
  'version',
  'revision',
  'origin',
  'title',
  'creators',
  'startPage',
  'videoSources',
  'interactionRelays',
  'search',
  'site',
] as const
const HEX64 = /^[0-9a-f]{64}$/
const ACCENT = /^#[0-9a-fA-F]{6}$/
const HIDDEN_VIDEO = /^(?:[0-9a-f]{64}|\d+:[0-9a-f]{64}:.+)$/
const isWs = (u: unknown) => typeof u === 'string' && /^wss?:\/\/[^/\s]+\/?$/.test(u)
const isOrigin = (u: unknown) => typeof u === 'string' && /^https:\/\/[^/\s]+$/.test(u)

const isHomepageVideoRef = (value: unknown): value is string =>
  typeof value === 'string' &&
  [...value].length <= 1024 &&
  !/\p{Cc}/u.test(value) &&
  (HEX64.test(value) || /^3423[56]:[0-9a-f]{64}:.+$/.test(value))

function isHomepageLink(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const link = value as { label?: unknown; url?: unknown }
  if (
    typeof link.label !== 'string' ||
    !link.label.trim() ||
    [...link.label].length > 80 ||
    typeof link.url !== 'string' ||
    [...link.url].length > 2048 ||
    !link.url.startsWith('https://') ||
    /[\s\p{Cc}]/u.test(link.url)
  )
    return false
  try {
    const url = new URL(link.url)
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}

/** Strict validation of the `site` object; the server and the studio apply the same rules. */
export function validateSite(value: unknown): string[] {
  const e: string[] = []
  const site = value as {
    tagline?: unknown
    theme?: { accent?: unknown; font?: unknown } | null
    videos?: { hidden?: unknown } | null
    links?: Record<string, unknown> | null
    pages?: Record<string, unknown> | null
    homepage?: unknown
  } | null
  if (!site || typeof site !== 'object') return ['site must be an object']
  if (typeof site.tagline !== 'string') e.push('site.tagline must be a string')
  const theme = site.theme
  if (!theme || typeof theme !== 'object') e.push('site.theme must be an object')
  else {
    if (typeof theme.accent !== 'string' || !ACCENT.test(theme.accent))
      e.push('site.theme.accent must be #rrggbb')
    if (!SITE_FONTS.includes(theme.font as SiteFont))
      e.push(`site.theme.font must be one of ${SITE_FONTS.join(', ')}`)
  }
  const hidden = site.videos?.hidden
  if (!Array.isArray(hidden) || !hidden.every(isHiddenVideoRef))
    e.push('site.videos.hidden must be a list of <kind>:<pubkey>:<d> or event ids')
  const links = site.links
  if (!links || typeof links !== 'object') e.push('site.links must be an object')
  else
    for (const key of SITE_LINK_KEYS)
      if (!isLinkTemplate(links[key]))
        e.push(`site.links.${key} must be an https URL containing {nip19}`)
  // Optional on the wire (a server from before the field): absent means no pages.
  if (site.pages !== undefined) {
    const pages = site.pages
    if (!pages || typeof pages !== 'object' || Array.isArray(pages))
      e.push('site.pages must be an object')
    else
      for (const key of SITE_PAGES) {
        const texts = pages[key]
        if (texts === undefined) continue
        const ok =
          !!texts &&
          typeof texts === 'object' &&
          !Array.isArray(texts) &&
          Object.entries(texts).every(([lang, text]) => PAGE_LANG.test(lang) && isPageText(text))
        if (!ok)
          e.push(
            `site.pages.${key} must map two-letter language codes to non-empty texts of at most ${SITE_PAGE_MAX_CHARS} characters`
          )
      }
  }
  if (site.homepage !== undefined) {
    const home = site.homepage as Partial<SiteHomepage> | null
    if (!home || typeof home !== 'object' || Array.isArray(home))
      e.push('site.homepage must be an object')
    else {
      if (typeof home.intro !== 'string' || [...home.intro].length > 2000)
        e.push('site.homepage.intro must be a text of at most 2000 characters')
      if (home.featured !== '' && !isHomepageVideoRef(home.featured))
        e.push('site.homepage.featured must be empty or a video address or event id')
      if (typeof home.featuredText !== 'string' || [...home.featuredText].length > 500)
        e.push('site.homepage.featuredText must be a text of at most 500 characters')
      if (
        !Array.isArray(home.selected) ||
        home.selected.length > 12 ||
        !home.selected.every(isHomepageVideoRef) ||
        new Set(home.selected).size !== home.selected.length
      )
        e.push(
          'site.homepage.selected must contain at most 12 distinct video addresses or event ids'
        )
      if (!Array.isArray(home.links) || home.links.length > 5 || !home.links.every(isHomepageLink))
        e.push('site.homepage.links must contain at most 5 named HTTPS links without credentials')
      if (home.action !== null && !isHomepageLink(home.action))
        e.push('site.homepage.action must be null or a named HTTPS link without credentials')
    }
  }
  return e
}

/** True for `<kind>:<pubkey>:<d>` (addressable events) or a 64-hex event id. */
export const isHiddenVideoRef = (v: unknown): v is string =>
  typeof v === 'string' && HIDDEN_VIDEO.test(v)

/**
 * Strict v1 validation. Missing never means "use the app default" (the one exception is
 * `profileRelays`, newer than the contract); unknown fields are ignored.
 */
export function parseInstanceConfig(json: unknown): ParseResult {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, kind: 'invalid', errors: ['body is not a JSON object'] }
  }
  const c = json as Record<string, unknown>
  if (c.version !== CONTRACT_VERSION) {
    return {
      ok: false,
      kind: 'unsupported-version',
      errors: [`contract version ${JSON.stringify(c.version)}; this app reads ${CONTRACT_VERSION}`],
    }
  }
  const e: string[] = []
  for (const k of REQUIRED) if (!(k in c)) e.push(`${k} is missing`)
  if ('revision' in c && !(Number.isInteger(c.revision) && (c.revision as number) > 0))
    e.push('revision must be a positive integer')
  if ('origin' in c && !isOrigin(c.origin)) e.push('origin must be https://host with no path')
  if ('title' in c && (typeof c.title !== 'string' || !c.title.trim()))
    e.push('title must be a non-empty string')
  const creatorsOk =
    Array.isArray(c.creators) && c.creators.every(p => typeof p === 'string' && HEX64.test(p))
  if ('creators' in c && !creatorsOk) e.push('creators must be a list of hex pubkeys')
  for (const k of ['videoSources', 'interactionRelays'] as const) {
    if (k in c && !(Array.isArray(c[k]) && (c[k] as unknown[]).every(isWs)))
      e.push(`${k} must be a list of ws(s):// relay URLs`)
  }
  // Optional (nostube-server ADR 0008): absent keeps the defaults, a present value must be valid.
  if ('profileRelays' in c && !(Array.isArray(c.profileRelays) && c.profileRelays.every(isWs)))
    e.push('profileRelays must be a list of ws(s):// relay URLs')
  if ('search' in c) {
    const s = c.search as { mode?: unknown } | null
    if (!s || typeof s !== 'object' || !['off', 'local'].includes(s.mode as string))
      e.push('search.mode must be off or local')
  }
  if ('site' in c) e.push(...validateSite(c.site))
  if ('startPage' in c && creatorsOk) {
    const creators = c.creators as string[]
    const sp = c.startPage as { kind?: unknown; creator?: unknown } | null
    if (creators.length === 0) {
      if (sp !== null) e.push('startPage must be null while there are no creators')
    } else if (!sp || sp.kind !== 'creator-profile' || !creators.includes(sp.creator as string)) {
      e.push('startPage must be {kind:"creator-profile", creator} naming one of the creators')
    }
  }
  if (e.length) return { ok: false, kind: 'invalid', errors: e }
  const {
    version,
    revision,
    origin,
    title,
    creators,
    startPage,
    videoSources,
    interactionRelays,
    search,
    site,
  } = c as unknown as InstanceConfig
  return {
    ok: true,
    config: {
      version,
      revision,
      origin,
      title,
      creators,
      startPage,
      videoSources,
      interactionRelays,
      profileRelays: (c.profileRelays as string[] | undefined) ?? [...DEFAULT_PROFILE_RELAYS],
      search,
      site: {
        tagline: site.tagline,
        theme: { accent: site.theme.accent, font: site.theme.font },
        videos: { hidden: site.videos.hidden },
        links: {
          profile: site.links.profile,
          video: site.links.video,
          note: site.links.note,
        },
        // Absent (a server from before the field) means no pages; validated above when present.
        pages: Object.fromEntries(
          SITE_PAGES.map(k => [k, { ...(site.pages as Partial<SitePages> | undefined)?.[k] }])
        ) as SitePages,
        ...(site.homepage && {
          homepage: {
            ...site.homepage,
            selected: [...site.homepage.selected],
            links: site.homepage.links.map(link => ({ ...link })),
            action: site.homepage.action ? { ...site.homepage.action } : null,
          },
        }),
        // Optional: a field that is not a branding URL of this server is left out, the rest stays.
        ...Object.fromEntries(
          BRANDING_SLOTS.filter(s => isBrandingUrl(s, site[s])).map(s => [s, site[s]])
        ),
      },
    },
  }
}

/**
 * Loads and applies the baked config when present, otherwise `/api/config` (contract v1).
 * Run before creating the client: its relay allowlist uses the registered config.
 */
export async function loadInstanceConfig(fetchImpl: typeof fetch = fetch): Promise<InstanceConfig> {
  const inline =
    typeof document === 'undefined'
      ? undefined
      : document.getElementById('nostube-config')?.textContent
  if (inline) return applyInstanceConfig(JSON.parse(inline))
  const response = await fetchImpl('/api/config')
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`/api/config answered ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  return applyInstanceConfig(await response.json())
}

/** Validates and registers a public config the page already has (the same rules as a load). */
export function applyInstanceConfig(json: unknown): InstanceConfig {
  const parsed = parseInstanceConfig(json)
  if (!parsed.ok) throw new Error(`Invalid instance config: ${parsed.errors.join('; ')}`)
  setInstanceConfig(parsed.config)
  return parsed.config
}

export type ConfigResponse =
  { kind: 'network-error' } | { kind: 'http'; status: number; body?: unknown }

export type LoadDecision =
  | { mode: 'run'; config: InstanceConfig; stale: boolean }
  | { mode: 'retry'; reason: string }
  | { mode: 'error'; reason: string }

/** ADR 0005 load outcomes: valid → run; unreachable/5xx → last good or retry; anything else → error. */
export function decideLoad(
  response: ConfigResponse,
  lastGood: InstanceConfig | null
): LoadDecision {
  if (response.kind === 'network-error' || response.status >= 500) {
    return lastGood
      ? { mode: 'run', config: lastGood, stale: true }
      : { mode: 'retry', reason: 'This instance cannot be reached right now.' }
  }
  if (response.status !== 200) {
    return { mode: 'error', reason: `The instance answered ${response.status} for /api/config.` }
  }
  const parsed = parseInstanceConfig(response.body)
  if (!parsed.ok) {
    return {
      mode: 'error',
      reason:
        parsed.kind === 'unsupported-version'
          ? `App and instance disagree on the config format (${parsed.errors[0]}).`
          : `Instance config rejected: ${parsed.errors.join('; ')}`,
    }
  }
  return { mode: 'run', config: parsed.config, stale: false }
}

let current: InstanceConfig | null = null
let allowedRelays = new Set<string>()
// NIP-46 bunker and NWC URIs carry their own relays (e.g. relay.getalby.com). The signer and
// wallet cannot work without them, so user-initiated URIs add them to the allowlist.
const signerRelays = new Set<string>()

/** normalizeURL throws on garbage; garbage then simply matches nothing. */
function normalizeRelay(url: string): string {
  try {
    return normalizeURL(url)
  } catch {
    return url
  }
}

export function setInstanceConfig(config: InstanceConfig) {
  current = config
  allowedRelays = new Set(config ? instanceRelays(config).map(normalizeRelay) : [])
}

/** The applied instance config; always null outside the instance build. */
export function getInstanceConfig(): InstanceConfig | null {
  return current
}

/** Instance build: the only relays the app may connect to. Always true outside it. */
export function isRelayAllowed(url: string): boolean {
  return !current || allowedRelays.has(normalizeRelay(url)) || signerRelays.has(normalizeRelay(url))
}

/**
 * Instance build: allow the relays a NIP-46 bunker:// URI (or resolved NIP-05) needs for
 * login, and a nostr+walletconnect:// URI needs for its wallet, alongside the configured
 * instance relays. No-op outside the instance build.
 */
export function allowSignerRelays(relays: readonly string[]) {
  if (!current) return
  relays.forEach(url => signerRelays.add(normalizeRelay(url)))
}

/** videoSources ∪ interactionRelays: replaces hint/outbox/preset unions in the instance build. */
export function instanceRelays(config: InstanceConfig): string[] {
  return [...new Set([...config.videoSources, ...config.interactionRelays])]
}

const VIDEO_KINDS = new Set([21, 22, 34235, 34236])
export const isVideoKind = (kind: number) => VIDEO_KINDS.has(kind)

interface ScopableFilter {
  kinds?: number[]
  authors?: string[]
}

/**
 * Video catalog scope: a request that asks for video kinds goes only to `videoSources` and
 * only for `creators`. Hints, presets, outbox and NIP-65 relays never widen it. Returns null
 * when nothing may be requested (e.g. a non-creator author page, or only non-source relays).
 * Requests without video kinds pass through unchanged.
 */
export function scopeVideoRequest<F extends ScopableFilter>(
  config: InstanceConfig,
  relays: string[],
  filters: F[]
): { relays: string[]; filters: F[] } | null {
  const isVideoFilter = (f: F) => !!f.kinds?.some(isVideoKind)
  if (!filters.some(isVideoFilter)) return { relays, filters }
  const scoped = filters.flatMap(f => {
    if (!isVideoFilter(f)) return [f]
    const authors = f.authors ? f.authors.filter(a => config.creators.includes(a)) : config.creators
    return authors.length ? [{ ...f, authors }] : []
  })
  const sources = new Set(config.videoSources.map(normalizeRelay))
  const sourceRelays = relays.filter(r => sources.has(normalizeRelay(r)))
  if (!scoped.some(isVideoFilter) || sourceRelays.length === 0) return null
  return { relays: sourceRelays, filters: scoped }
}

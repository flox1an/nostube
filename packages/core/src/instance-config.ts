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

export type InstanceSearch = { mode: 'off' } | { mode: 'local' } | { mode: 'external'; url: string }

export const SITE_FONTS = ['sans', 'serif', 'mono'] as const
export type SiteFont = (typeof SITE_FONTS)[number]

/** How the instance's site looks and which videos it shows (the viewer's light/dark follows the system). */
export interface InstanceSite {
  tagline: string
  theme: { accent: string; font: SiteFont }
  /** Everything of the creators is shown except these: `<kind>:<pubkey>:<d>` or an event id. */
  videos: { hidden: string[] }
}

export interface InstanceConfig {
  version: 1
  revision: number
  origin: string
  title: string
  creators: string[]
  startPage: { kind: 'creator-profile'; creator: string } | null
  videoSources: string[]
  interactionRelays: string[]
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

/** Strict v1 validation. Missing never means "use the app default"; unknown fields are ignored. */
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
  if ('search' in c) {
    const s = c.search as { mode?: unknown; url?: unknown } | null
    if (!s || typeof s !== 'object' || !['off', 'local', 'external'].includes(s.mode as string))
      e.push('search.mode must be off, local or external')
    else if (s.mode === 'external' && !(typeof s.url === 'string' && /^https:\/\/\S+$/.test(s.url)))
      e.push('search.url must be an https URL for external search')
  }
  if ('site' in c) {
    const site = c.site as {
      tagline?: unknown
      theme?: { accent?: unknown; font?: unknown } | null
      videos?: { hidden?: unknown } | null
    } | null
    if (!site || typeof site !== 'object') e.push('site must be an object')
    else {
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
      if (
        !Array.isArray(hidden) ||
        !hidden.every(v => typeof v === 'string' && HIDDEN_VIDEO.test(v))
      )
        e.push('site.videos.hidden must be a list of <kind>:<pubkey>:<d> or event ids')
    }
  }
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
      search,
      site: {
        tagline: site.tagline,
        theme: { accent: site.theme.accent, font: site.theme.font },
        videos: { hidden: site.videos.hidden },
      },
    },
  }
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

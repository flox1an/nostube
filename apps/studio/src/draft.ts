import { nip19 } from 'nostr-tools'
import { toHiddenVideoRef } from '@nostube/core/hidden-videos'
import {
  DEFAULT_SITE_LINKS,
  SITE_FONTS,
  SITE_PAGES,
  SITE_PAGE_MAX_CHARS,
  validateSite,
  type InstanceSite,
  type SiteHomepage,
  type SiteFont,
  type SitePages,
  type Reach,
} from '@nostube/core/instance-config'
import type { AdminConfig, SearchConfig, SiteHosting } from './api'
import i18n from './i18n'

/** The form's own shape: lists as one entry per line, numbers as typed. */
export interface Draft {
  title: string
  tagline: string
  accent: string
  font: SiteFont
  /** Lightning address (`name@domain.tld`) for zaps to the managed channel identity; empty = none. */
  lightning: string
  /** The server counts plays per video file and day. */
  countPlays: boolean
  hiddenText: string
  links: InstanceSite['links']
  pages: SitePages
  creatorsText: string
  writersText: string
  videoSourcesText: string
  interactionRelaysText: string
  /** Visitor profile lookups and, in `public`, where the managed key's kind 0 and 10002 go. */
  profileRelaysText: string
  /** Empty lists: the outbox is off. */
  mirrorRelaysText: string
  mirrorBlossomText: string
  searchMode: SearchConfig['mode']
  quota: string
  reserve: string
  reach: Reach
  siteHosting: SiteHosting
  nsiteGateway: string
  nsiteDomain: string
  /** Absent for a config saved before the homepage existed, until the creator edits it. */
  homepage?: SiteHomepage
}

const toLines = (text: string) =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

export function toDraft(c: AdminConfig): Draft {
  return {
    title: c.title,
    tagline: c.site.tagline,
    accent: c.site.theme.accent,
    font: c.site.theme.font,
    lightning: c.site.lightning ?? '',
    countPlays: c.site.countPlays ?? false,
    hiddenText: c.site.videos.hidden.join('\n'),
    links: { ...c.site.links },
    pages: structuredClone(c.site.pages),
    creatorsText: c.creators.join('\n'),
    writersText: c.allowedWriters.join('\n'),
    videoSourcesText: c.videoSources.join('\n'),
    interactionRelaysText: c.interactionRelays.join('\n'),
    profileRelaysText: c.profileRelays.join('\n'),
    mirrorRelaysText: c.mirror.relays.join('\n'),
    mirrorBlossomText: c.mirror.blossom.join('\n'),
    searchMode: c.search.mode,
    quota: String(c.storage.quotaGib),
    reserve: String(c.storage.freeSpaceReserveGib),
    reach: c.reach,
    siteHosting: c.siteHosting,
    nsiteGateway: c.nsite.gateway,
    nsiteDomain: c.nsite.domain,
    homepage: c.site.homepage && structuredClone(c.site.homepage),
  }
}

const HEX64 = /^[0-9a-f]{64}$/

/** A pubkey as typed (hex or npub) in its hex form, or null. */
export function toHexKey(input: string): string | null {
  if (HEX64.test(input)) return input
  try {
    const decoded = nip19.decode(input)
    return decoded.type === 'npub' ? decoded.data : null
  } catch {
    return null
  }
}

function keys(label: string, text: string, errors: string[]): string[] {
  return toLines(text).flatMap(line => {
    const hex = toHexKey(line)
    if (!hex) errors.push(i18n.t('studio.errors.notKey', { label, line }))
    return hex ? [hex] : []
  })
}

function relays(label: string, text: string, errors: string[]): string[] {
  return toLines(text).filter(line => {
    const ok = /^wss?:\/\/[^/\s]+\/?$/.test(line)
    if (!ok) errors.push(i18n.t('studio.errors.notRelay', { label, line }))
    return ok
  })
}

function servers(label: string, text: string, errors: string[]): string[] {
  return toLines(text).filter(line => {
    const ok = /^https?:\/\/[^/\s]+\/?$/.test(line)
    if (!ok) errors.push(i18n.t('studio.errors.notServer', { label, line }))
    return ok
  })
}

const PUBLIC_DNS =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

/** Matches the server's public-host rule: DNS names, not LAN names or IP addresses. */
function publicHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, '')
  return (
    PUBLIC_DNS.test(name) &&
    !name.endsWith('.local') &&
    !name.endsWith('.localhost') &&
    !/\.\d+$/.test(name)
  )
}

/** Public eligibility follows the draft, not the server's last saved mirror lists. */
export function draftCanBePublic(
  originIsPublic: boolean,
  draft: Pick<Draft, 'mirrorRelaysText' | 'mirrorBlossomText'>
): boolean {
  if (originIsPublic) return true
  const hasTarget = (text: string, scheme: RegExp) =>
    toLines(text).some(line => {
      try {
        const url = new URL(line)
        return (
          scheme.test(url.protocol) &&
          !url.username &&
          !url.password &&
          (url.pathname === '' || url.pathname === '/') &&
          !url.search &&
          !url.hash &&
          publicHost(url.hostname)
        )
      } catch {
        return false
      }
    })
  return (
    hasTarget(draft.mirrorRelaysText, /^wss?:$/) && hasTarget(draft.mirrorBlossomText, /^https?:$/)
  )
}

/** The server's rule: empty, or `local@domain` with a dot in the domain, no whitespace, ≤ 254 bytes. */
export const isLightningAddress = (value: string) =>
  value === '' ||
  (new TextEncoder().encode(value).length <= 254 && /^[^@\s]+@[^@\s]*\.[^@\s]*$/.test(value))

/** True when saving `next` restarts the server: the fields of `Config::needs_restart` (server `config.rs`). */
export function needsRestart(saved: AdminConfig, next: AdminConfig): boolean {
  const same = (a: string[], b: string[]) => a.join('\n') === b.join('\n')
  return (
    !same(saved.allowedWriters, next.allowedWriters) ||
    saved.storage.quotaGib !== next.storage.quotaGib ||
    saved.storage.freeSpaceReserveGib !== next.storage.freeSpaceReserveGib ||
    !same(saved.mirror.relays, next.mirror.relays) ||
    !same(saved.mirror.blossom, next.mirror.blossom)
  )
}

function count(label: string, text: string, errors: string[]): number {
  const n = Number(text)
  if (text.trim() === '' || !Number.isInteger(n) || n < 0)
    errors.push(i18n.t('studio.errors.notCount', { label }))
  return n
}

/** The server's homepage limits: characters of the texts, videos to select, named links. */
export const HOMEPAGE_LIMITS = { intro: 2000, note: 500, selected: 12, links: 5 }

/** The homepage as saved: texts trimmed, link rows and a main button left empty dropped. */
function savedHomepage(h: SiteHomepage): SiteHomepage {
  const [action, ...links] = [h.action, ...h.links].map(
    l => l && { label: l.label.trim(), url: l.url.trim() }
  )
  return {
    intro: h.intro.trim(),
    featured: h.featured,
    featuredText: h.featuredText.trim(),
    selected: h.selected,
    links: links.filter(l => l !== null && (l.label || l.url)) as SiteHomepage['links'],
    action: action && (action.label || action.url) ? action : null,
  }
}

/** The message (`studio.errors.homepage.*`) for a homepage field the core reports. */
const HOMEPAGE_ERRORS: Record<keyof SiteHomepage, string> = {
  intro: 'intro',
  featuredText: 'featuredText',
  featured: 'videos',
  selected: 'videos',
  links: 'link',
  action: 'link',
}

export type DraftResult = { config: AdminConfig; errors: [] } | { config: null; errors: string[] }

/** Checks the draft with the same rules as the server and builds what gets saved. */
export function fromDraft(d: Draft, originIsPublic = true): DraftResult {
  const errors: string[] = []
  if (!d.title.trim()) errors.push(i18n.t('studio.errors.titleEmpty'))
  const hidden = toLines(d.hiddenText).flatMap(line => {
    const ref = toHiddenVideoRef(line)
    if (!ref) errors.push(i18n.t('studio.errors.notVideoLink', { line }))
    return ref ? [ref] : []
  })
  // A config saved before the homepage existed keeps none until the creator edits it.
  const homepage = d.homepage && savedHomepage(d.homepage)
  const site = {
    tagline: d.tagline.trim(),
    theme: { accent: d.accent.toLowerCase(), font: d.font },
    videos: { hidden: [...new Set(hidden)] },
    links: {
      profile: d.links.profile.trim(),
      video: d.links.video.trim(),
      note: d.links.note.trim(),
    },
    // A language left empty is no text; the page itself is gone when no language is left.
    pages: Object.fromEntries(
      SITE_PAGES.map(page => [
        page,
        Object.fromEntries(
          Object.entries(d.pages[page])
            .map(([lang, text]) => [lang, text.trim()])
            .filter(([, text]) => text)
        ),
      ])
    ) as SitePages,
    ...(homepage && { homepage }),
  }
  // The core names the field that is wrong (`site.theme.accent`, `site.links.note`); the message
  // shown is ours. The form cannot produce its other errors (the hidden list is checked above).
  errors.push(
    ...validateSite(site)
      .filter(e => !e.includes('hidden'))
      .map(e => {
        const link = /^site\.links\.(profile|video|note)\b/.exec(e)?.[1]
        if (link) {
          return i18n.t('studio.errors.link', {
            kind: i18n.t(`studio.appearance.linkKinds.${link}`),
          })
        }
        const page = /^site\.pages\.(about|imprint|privacy)\b/.exec(e)?.[1]
        if (page) {
          return i18n.t('studio.errors.pageText', {
            page: i18n.t(`studio.pages.kinds.${page}`),
            max: SITE_PAGE_MAX_CHARS,
          })
        }
        const home = /^site\.homepage\.(intro|featuredText|featured|selected|links|action)\b/.exec(
          e
        )?.[1] as keyof SiteHomepage | undefined
        if (home) return i18n.t(`studio.errors.homepage.${HOMEPAGE_ERRORS[home]}`, HOMEPAGE_LIMITS)
        return e.startsWith('site.theme.accent') ? i18n.t('studio.errors.accent') : e
      })
  )
  if (!SITE_FONTS.includes(d.font)) errors.push(i18n.t('studio.errors.font'))
  const lightning = d.lightning.trim()
  if (!isLightningAddress(lightning)) errors.push(i18n.t('studio.appearance.lightningInvalid'))
  const label = (key: string) => i18n.t(`studio.errors.labels.${key}`)
  const creators = keys(label('creators'), d.creatorsText, errors)
  const allowedWriters = keys(label('writers'), d.writersText, errors)
  const videoSources = relays(label('videoSources'), d.videoSourcesText, errors)
  const interactionRelays = relays(label('interactionRelays'), d.interactionRelaysText, errors)
  const profileRelays = relays(label('profileRelays'), d.profileRelaysText, errors)
  const mirrorRelays = relays(label('mirrorRelays'), d.mirrorRelaysText, errors)
  const mirrorBlossom = servers(label('mirrorBlossom'), d.mirrorBlossomText, errors)
  if (d.reach === 'public' && !draftCanBePublic(originIsPublic, d))
    errors.push(i18n.t('studio.reach.unavailable'))
  const gateway = d.nsiteGateway.trim().toLowerCase()
  const domain = d.nsiteDomain.trim().toLowerCase()
  if (
    !PUBLIC_DNS.test(gateway) ||
    !publicHost(gateway) ||
    (domain !== '' && (!PUBLIC_DNS.test(domain) || !publicHost(domain)))
  )
    errors.push(i18n.t('studio.nsite.invalidHost'))
  const quotaGib = count(label('quota'), d.quota, errors)
  const freeSpaceReserveGib = count(label('reserve'), d.reserve, errors)
  const search: AdminConfig['search'] = { mode: d.searchMode }
  if (errors.length) return { config: null, errors }
  return {
    config: {
      title: d.title.trim(),
      creators,
      allowedWriters,
      videoSources,
      interactionRelays,
      profileRelays,
      mirror: { relays: mirrorRelays, blossom: mirrorBlossom },
      search,
      storage: { quotaGib, freeSpaceReserveGib },
      site: { ...site, lightning, countPlays: d.countPlays },
      reach: d.reach,
      siteHosting: d.reach === 'private' ? 'instance' : d.siteHosting,
      nsite: { gateway, domain },
    },
    errors: [],
  }
}

const refOf = (line: string) => toHiddenVideoRef(line) ?? line

/** True when `ref` (see `videoRef`) is among the hidden lines, however each line was written. */
export function isRefHidden(hiddenText: string, ref: string): boolean {
  return toLines(hiddenText).some(line => refOf(line) === ref)
}

/**
 * Adds or removes a video in the hidden lines and leaves every other line as it is. A video may
 * be listed by its coordinate or by its id (another client's nevent): pass both, and switching it
 * off removes either spelling, switching it on adds the first one.
 */
export function setRefHidden(hiddenText: string, refs: string | string[], hidden: boolean): string {
  const all = Array.isArray(refs) ? refs : [refs]
  const kept = toLines(hiddenText).filter(line => !all.includes(refOf(line)))
  return (hidden ? [...kept, all[0]] : kept).join('\n')
}

/** Ready-made choices for where links to other Nostr content go (named in `studio.appearance.presets`). */
export const LINK_PRESETS: { id: string; links: InstanceSite['links'] }[] = [
  { id: 'default', links: DEFAULT_SITE_LINKS },
  {
    id: 'njump',
    links: {
      profile: 'https://njump.me/{nip19}',
      video: 'https://njump.me/{nip19}',
      note: 'https://njump.me/{nip19}',
    },
  },
]

/** The preset the links match, or `custom`. */
export function linkPresetOf(links: InstanceSite['links']): string {
  return (
    LINK_PRESETS.find(
      p =>
        p.links.profile === links.profile &&
        p.links.video === links.video &&
        p.links.note === links.note
    )?.id ?? 'custom'
  )
}

/** True when the key is a creator and may write: nothing is left to connect. */
export function isKeyConnected(config: AdminConfig, pubkey: string | null): boolean {
  return (
    pubkey !== null && config.creators.includes(pubkey) && config.allowedWriters.includes(pubkey)
  )
}

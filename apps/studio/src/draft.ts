import { nip19 } from 'nostr-tools'
import { toHiddenVideoRef } from '@nostube/core/hidden-videos'
import {
  DEFAULT_SITE_LINKS,
  SITE_FONTS,
  validateSite,
  type InstanceSite,
  type SiteFont,
} from '@nostube/core/instance-config'
import type { AdminConfig } from './api'
import i18n from './i18n'

/** The form's own shape: lists as one entry per line, numbers as typed. */
export interface Draft {
  title: string
  tagline: string
  accent: string
  font: SiteFont
  hiddenText: string
  links: InstanceSite['links']
  creatorsText: string
  writersText: string
  videoSourcesText: string
  interactionRelaysText: string
  /** Empty: local only, the site looks a visitor's profile up only on the instance relays. */
  profileRelaysText: string
  /** Empty lists: the outbox is off. */
  mirrorRelaysText: string
  mirrorBlossomText: string
  searchMode: 'off' | 'local' | 'external'
  searchUrl: string
  quota: string
  reserve: string
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
    hiddenText: c.site.videos.hidden.join('\n'),
    links: { ...c.site.links },
    creatorsText: c.creators.join('\n'),
    writersText: c.allowedWriters.join('\n'),
    videoSourcesText: c.videoSources.join('\n'),
    interactionRelaysText: c.interactionRelays.join('\n'),
    profileRelaysText: c.profileRelays.join('\n'),
    mirrorRelaysText: c.mirror.relays.join('\n'),
    mirrorBlossomText: c.mirror.blossom.join('\n'),
    searchMode: c.search.mode,
    searchUrl: c.search.mode === 'external' ? c.search.url : '',
    quota: String(c.storage.quotaGib),
    reserve: String(c.storage.freeSpaceReserveGib),
  }
}

const HEX64 = /^[0-9a-f]{64}$/

/** A pubkey as typed (hex or npub) in its hex form, or null. */
function toHexKey(input: string): string | null {
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

function count(label: string, text: string, errors: string[]): number {
  const n = Number(text)
  if (text.trim() === '' || !Number.isInteger(n) || n < 0)
    errors.push(i18n.t('studio.errors.notCount', { label }))
  return n
}

export type DraftResult = { config: AdminConfig; errors: [] } | { config: null; errors: string[] }

/** Checks the draft with the same rules as the server and builds what gets saved. */
export function fromDraft(d: Draft): DraftResult {
  const errors: string[] = []
  if (!d.title.trim()) errors.push(i18n.t('studio.errors.titleEmpty'))
  const hidden = toLines(d.hiddenText).flatMap(line => {
    const ref = toHiddenVideoRef(line)
    if (!ref) errors.push(i18n.t('studio.errors.notVideoLink', { line }))
    return ref ? [ref] : []
  })
  const site = {
    tagline: d.tagline.trim(),
    theme: { accent: d.accent.toLowerCase(), font: d.font },
    videos: { hidden: [...new Set(hidden)] },
    links: {
      profile: d.links.profile.trim(),
      video: d.links.video.trim(),
      note: d.links.note.trim(),
    },
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
        return e.startsWith('site.theme.accent') ? i18n.t('studio.errors.accent') : e
      })
  )
  if (!SITE_FONTS.includes(d.font)) errors.push(i18n.t('studio.errors.font'))
  const label = (key: string) => i18n.t(`studio.errors.labels.${key}`)
  const creators = keys(label('creators'), d.creatorsText, errors)
  const allowedWriters = keys(label('writers'), d.writersText, errors)
  const videoSources = relays(label('videoSources'), d.videoSourcesText, errors)
  const interactionRelays = relays(label('interactionRelays'), d.interactionRelaysText, errors)
  const profileRelays = relays(label('profileRelays'), d.profileRelaysText, errors)
  const mirrorRelays = relays(label('mirrorRelays'), d.mirrorRelaysText, errors)
  const mirrorBlossom = servers(label('mirrorBlossom'), d.mirrorBlossomText, errors)
  const quotaGib = count(label('quota'), d.quota, errors)
  const freeSpaceReserveGib = count(label('reserve'), d.reserve, errors)
  let search: AdminConfig['search'] = { mode: 'off' }
  if (d.searchMode === 'local') search = { mode: 'local' }
  if (d.searchMode === 'external') {
    const url = d.searchUrl.trim()
    if (!/^https:\/\/\S+$/.test(url)) errors.push(i18n.t('studio.errors.searchUrl'))
    search = { mode: 'external', url }
  }
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
      site,
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

/**
 * The config with this public key added as creator and as an allowed writer (once each). On a new
 * instance both lists are empty, which switches upload and mirror off: this is the one step that
 * lets the owner publish. The first creator is the start page, so an existing one stays first.
 */
export function addKeyToConfig(config: AdminConfig, pubkey: string): AdminConfig {
  const add = (list: string[]) => (list.includes(pubkey) ? list : [...list, pubkey])
  return { ...config, creators: add(config.creators), allowedWriters: add(config.allowedWriters) }
}

/** True when the key is a creator and may write: nothing is left to connect. */
export function isKeyConnected(config: AdminConfig, pubkey: string | null): boolean {
  return (
    pubkey !== null && config.creators.includes(pubkey) && config.allowedWriters.includes(pubkey)
  )
}

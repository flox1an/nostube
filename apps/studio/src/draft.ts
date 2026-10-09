import { nip19 } from 'nostr-tools'
import { toHiddenVideoRef } from '@nostube/core/hidden-videos'
import { SITE_FONTS, validateSite, type SiteFont } from '@nostube/core/instance-config'
import type { AdminConfig } from './api'

/** The form's own shape: lists as one entry per line, numbers as typed. */
export interface Draft {
  title: string
  tagline: string
  accent: string
  font: SiteFont
  hiddenText: string
  creatorsText: string
  writersText: string
  videoSourcesText: string
  interactionRelaysText: string
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
    creatorsText: c.creators.join('\n'),
    writersText: c.allowedWriters.join('\n'),
    videoSourcesText: c.videoSources.join('\n'),
    interactionRelaysText: c.interactionRelays.join('\n'),
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
    if (!hex) errors.push(`${label}: "${line}" is not a hex or npub key.`)
    return hex ? [hex] : []
  })
}

function relays(label: string, text: string, errors: string[]): string[] {
  return toLines(text).filter(line => {
    const ok = /^wss?:\/\/[^/\s]+\/?$/.test(line)
    if (!ok) errors.push(`${label}: "${line}" must be a ws:// or wss:// relay URL.`)
    return ok
  })
}

function count(label: string, text: string, errors: string[]): number {
  const n = Number(text)
  if (text.trim() === '' || !Number.isInteger(n) || n < 0)
    errors.push(`${label} must be a whole number, 0 or more.`)
  return n
}

export type DraftResult = { config: AdminConfig; errors: [] } | { config: null; errors: string[] }

/** Checks the draft with the same rules as the server and builds what gets saved. */
export function fromDraft(d: Draft): DraftResult {
  const errors: string[] = []
  if (!d.title.trim()) errors.push('The title must not be empty.')
  const hidden = toLines(d.hiddenText).flatMap(line => {
    const ref = toHiddenVideoRef(line)
    if (!ref) errors.push(`Hidden videos: "${line}" is not a video link.`)
    return ref ? [ref] : []
  })
  const site = {
    tagline: d.tagline.trim(),
    theme: { accent: d.accent.toLowerCase(), font: d.font },
    videos: { hidden: [...new Set(hidden)] },
  }
  errors.push(...validateSite(site).filter(e => !e.includes('hidden')))
  if (!SITE_FONTS.includes(d.font)) errors.push('Choose one of the fonts.')
  const creators = keys('Creators', d.creatorsText, errors)
  const allowedWriters = keys('Allowed writers', d.writersText, errors)
  const videoSources = relays('Video sources', d.videoSourcesText, errors)
  const interactionRelays = relays('Interaction relays', d.interactionRelaysText, errors)
  const quotaGib = count('Storage quota', d.quota, errors)
  const freeSpaceReserveGib = count('Free-space reserve', d.reserve, errors)
  let search: AdminConfig['search'] = { mode: 'off' }
  if (d.searchMode === 'local') search = { mode: 'local' }
  if (d.searchMode === 'external') {
    const url = d.searchUrl.trim()
    if (!/^https:\/\/\S+$/.test(url))
      errors.push('Search: the external search needs an https:// URL.')
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
      search,
      storage: { quotaGib, freeSpaceReserveGib },
      site,
    },
    errors: [],
  }
}

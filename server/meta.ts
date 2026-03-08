import type { NostrEvent } from 'nostr-tools/pure'
import { npubEncode } from 'nostr-tools/nip19'
import { fetchBlossomServers, log } from './nostr.js'

const THUMB_HEAD_TIMEOUT_MS = 3000

export interface VideoMeta {
  title: string
  description: string
  thumbnail: string | null
  videoUrl: string | null
  mimeType: string | null
  width: number | null
  height: number | null
  authorNpub: string
  /** All candidate thumbnail URLs extracted from the event (for validation) */
  candidateThumbnails: string[]
}

/** Extract SHA256 hash from a blossom-style URL like https://server.com/<hash>.ext */
function extractHash(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const filename = pathname.split('/').pop() || ''
    const match = filename.match(/^([a-f0-9]{64})\.[^.]+$/i)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** Extract file extension from a URL */
function extractExt(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const filename = pathname.split('/').pop() || ''
    const dotIdx = filename.lastIndexOf('.')
    return dotIdx !== -1 ? filename.slice(dotIdx + 1) : 'jpg'
  } catch {
    return 'jpg'
  }
}

/** HEAD-request a URL and return true if it responds with 2xx/3xx */
async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(THUMB_HEAD_TIMEOUT_MS),
      redirect: 'follow',
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Try each candidate thumbnail URL with a HEAD request.
 * If none are reachable, extract the SHA256 hash and try the author's
 * blossom servers (kind 10063) as alternative hosts.
 */
export async function findValidThumbnail(
  candidates: string[],
  authorPubkey: string
): Promise<string | null> {
  if (candidates.length === 0) return null

  // Try each candidate URL
  for (const url of candidates) {
    log('thumbnail:head', { url: url.slice(0, 80) })
    if (await urlExists(url)) {
      log('thumbnail:found', { url: url.slice(0, 80) })
      return url
    }
  }

  // None of the original URLs worked — try blossom server fallback
  // Extract hash + extension from any candidate
  let hash: string | null = null
  let ext = 'jpg'
  for (const url of candidates) {
    hash = extractHash(url)
    if (hash) {
      ext = extractExt(url)
      break
    }
  }

  if (!hash) {
    log('thumbnail:no-hash', { candidates: candidates.length })
    return null
  }

  // Fetch the author's blossom server list
  const blossomServers = await fetchBlossomServers(authorPubkey)
  if (blossomServers.length === 0) {
    log('thumbnail:no-blossom-servers')
    return null
  }

  // Deduplicate: skip servers we already tried
  const triedHosts = new Set(
    candidates.map(u => {
      try {
        return new URL(u).host
      } catch {
        return ''
      }
    })
  )
  const newServers = blossomServers.filter(s => {
    try {
      return !triedHosts.has(new URL(s).host)
    } catch {
      return false
    }
  })

  log('thumbnail:trying-blossom', { servers: newServers.length, hash: hash.slice(0, 16) })

  for (const server of newServers) {
    const normalized = server.replace(/\/+$/, '')
    const url = `${normalized}/${hash}.${ext}`
    if (await urlExists(url)) {
      log('thumbnail:blossom-hit', { url: url.slice(0, 80) })
      return url
    }
  }

  log('thumbnail:all-failed', { candidates: candidates.length, blossomServers: newServers.length })
  return null
}

export function extractVideoMeta(event: NostrEvent): VideoMeta {
  const tags = event.tags
  const getTag = (name: string) => tags.find(t => t[0] === name)?.[1]

  const title = getTag('title') || 'Untitled Video'
  const description = getTag('summary') || event.content || ''
  const authorNpub = npubEncode(event.pubkey)

  // Collect ALL candidate thumbnail URLs in priority order
  const candidateThumbnails: string[] = []
  const thumbTag = getTag('thumb')
  if (thumbTag) candidateThumbnails.push(thumbTag)
  const imageTag = getTag('image')
  if (imageTag) candidateThumbnails.push(imageTag)

  // Extract video URL and dimensions from imeta tags
  let videoUrl: string | null = null
  let mimeType: string | null = null
  let width: number | null = null
  let height: number | null = null

  const imetaTags = tags.filter(t => t[0] === 'imeta')
  for (const imeta of imetaTags) {
    const values = new Map<string, string>()
    const imageUrls: string[] = []
    for (let i = 1; i < imeta.length; i++) {
      const firstSpace = imeta[i].indexOf(' ')
      if (firstSpace !== -1) {
        const key = imeta[i].slice(0, firstSpace)
        const value = imeta[i].slice(firstSpace + 1).trim()
        values.set(key, value)
        if (key === 'image' && value) {
          imageUrls.push(value)
        }
      }
    }

    const url = values.get('url')
    const m = values.get('m')
    const dim = values.get('dim')

    // Collect imeta image URLs as candidates (deduped)
    for (const imgUrl of imageUrls) {
      if (!candidateThumbnails.includes(imgUrl)) {
        candidateThumbnails.push(imgUrl)
      }
    }

    // Get video URL
    if (m?.startsWith('video/') && url) {
      videoUrl = url
      mimeType = m
      if (dim) {
        const [w, h] = dim.split('x').map(Number)
        if (w && h) {
          width = w
          height = h
        }
      }
    }
  }

  // Fallback: url tag for video
  if (!videoUrl) {
    videoUrl = getTag('url') || null
  }

  // Use first candidate as default (will be validated async by callers)
  const thumbnail = candidateThumbnails[0] || null

  return {
    title,
    description,
    thumbnail,
    videoUrl,
    mimeType,
    width,
    height,
    authorNpub,
    candidateThumbnails,
  }
}

export function buildMetaTags(
  meta: VideoMeta,
  pageUrl: string,
  embedUrl: string,
  oembedUrl: string,
  type: 'video' | 'short' | 'playlist',
  siteOrigin: string = 'https://nostu.be'
): string {
  const lines: string[] = []
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const imageUrl = meta.thumbnail || `${siteOrigin}/og-image.png`

  // Open Graph
  lines.push(
    `<meta property="og:type" content="${type === 'playlist' ? 'website' : 'video.other'}" />`
  )
  lines.push(`<meta property="og:title" content="${esc(meta.title)}" />`)
  lines.push(`<meta property="og:description" content="${esc(meta.description.slice(0, 200))}" />`)
  lines.push(`<meta property="og:url" content="${esc(pageUrl)}" />`)
  lines.push(`<meta property="og:site_name" content="NosTube" />`)

  lines.push(`<meta property="og:image" content="${esc(imageUrl)}" />`)

  if (meta.videoUrl && type !== 'playlist') {
    lines.push(`<meta property="og:video" content="${esc(meta.videoUrl)}" />`)
    if (meta.mimeType) {
      lines.push(`<meta property="og:video:type" content="${esc(meta.mimeType)}" />`)
    }
    if (meta.width) lines.push(`<meta property="og:video:width" content="${meta.width}" />`)
    if (meta.height) lines.push(`<meta property="og:video:height" content="${meta.height}" />`)
  }

  // Twitter Player Card
  if (meta.videoUrl && type !== 'playlist') {
    lines.push(`<meta name="twitter:card" content="player" />`)
    lines.push(`<meta name="twitter:player" content="${esc(embedUrl)}" />`)
    if (meta.width) lines.push(`<meta name="twitter:player:width" content="${meta.width}" />`)
    if (meta.height) lines.push(`<meta name="twitter:player:height" content="${meta.height}" />`)
  } else {
    lines.push(`<meta name="twitter:card" content="summary_large_image" />`)
  }

  lines.push(`<meta name="twitter:title" content="${esc(meta.title)}" />`)
  lines.push(`<meta name="twitter:description" content="${esc(meta.description.slice(0, 200))}" />`)
  lines.push(`<meta name="twitter:image" content="${esc(imageUrl)}" />`)

  // oEmbed discovery
  lines.push(`<link rel="alternate" type="application/json+oembed" href="${esc(oembedUrl)}" />`)

  return lines.join('\n    ')
}

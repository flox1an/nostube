import type { NostrEvent } from 'nostr-tools/pure'
import { npubEncode } from 'nostr-tools/nip19'

export interface VideoMeta {
  title: string
  description: string
  thumbnail: string | null
  videoUrl: string | null
  mimeType: string | null
  width: number | null
  height: number | null
  authorNpub: string
}

export function extractVideoMeta(event: NostrEvent): VideoMeta {
  const tags = event.tags
  const getTag = (name: string) => tags.find(t => t[0] === name)?.[1]

  const title = getTag('title') || 'Untitled Video'
  const description = getTag('summary') || event.content || ''
  const authorNpub = npubEncode(event.pubkey)

  // Extract thumbnail: thumb tag > image tag > imeta image
  let thumbnail = getTag('thumb') || getTag('image') || null

  // Extract video URL and dimensions from imeta tags
  let videoUrl: string | null = null
  let mimeType: string | null = null
  let width: number | null = null
  let height: number | null = null

  const imetaTags = tags.filter(t => t[0] === 'imeta')
  for (const imeta of imetaTags) {
    const values = new Map<string, string>()
    for (let i = 1; i < imeta.length; i++) {
      const firstSpace = imeta[i].indexOf(' ')
      if (firstSpace !== -1) {
        values.set(imeta[i].slice(0, firstSpace), imeta[i].slice(firstSpace + 1).trim())
      }
    }

    const url = values.get('url')
    const m = values.get('m')
    const dim = values.get('dim')

    // Use image from imeta as fallback thumbnail
    if (!thumbnail && m?.startsWith('image/') && url) {
      thumbnail = url
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

  return { title, description, thumbnail, videoUrl, mimeType, width, height, authorNpub }
}

export function buildMetaTags(
  meta: VideoMeta,
  pageUrl: string,
  embedUrl: string,
  oembedUrl: string,
  type: 'video' | 'short' | 'playlist'
): string {
  const lines: string[] = []
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

  // Open Graph
  lines.push(
    `<meta property="og:type" content="${type === 'playlist' ? 'website' : 'video.other'}" />`
  )
  lines.push(`<meta property="og:title" content="${esc(meta.title)}" />`)
  lines.push(`<meta property="og:description" content="${esc(meta.description.slice(0, 200))}" />`)
  lines.push(`<meta property="og:url" content="${esc(pageUrl)}" />`)
  lines.push(`<meta property="og:site_name" content="NosTube" />`)

  if (meta.thumbnail) {
    lines.push(`<meta property="og:image" content="${esc(meta.thumbnail)}" />`)
  }

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
  if (meta.thumbnail) {
    lines.push(`<meta name="twitter:image" content="${esc(meta.thumbnail)}" />`)
  }

  // oEmbed discovery
  lines.push(`<link rel="alternate" type="application/json+oembed" href="${esc(oembedUrl)}" />`)

  return lines.join('\n    ')
}

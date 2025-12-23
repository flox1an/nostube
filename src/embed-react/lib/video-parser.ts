import type { NostrEvent } from 'nostr-tools'

export interface VideoVariant {
  url: string
  mimeType?: string
  dimensions?: string
  size?: number
  hash?: string
  fallbackUrls: string[]
  quality?: string
}

export interface ParsedVideo {
  id: string
  kind: number
  title: string
  description: string
  author: string
  createdAt: number
  duration: number
  contentWarning?: string
  videoVariants: VideoVariant[]
  thumbnails: Array<{ url: string; fallbackUrls: string[] }>
}

/**
 * Parse a Nostr video event into usable metadata
 */
export function parseVideoEvent(event: NostrEvent): ParsedVideo {
  const imetaTags = event.tags.filter(t => t[0] === 'imeta')

  if (imetaTags.length > 0) {
    return parseImetaFormat(event, imetaTags)
  } else {
    return parseLegacyFormat(event)
  }
}

function parseImetaFormat(event: NostrEvent, imetaTags: string[][]): ParsedVideo {
  const allVariants = imetaTags.map(tag => parseImetaTag(tag)).filter(Boolean) as VideoVariant[]

  const videoVariants = allVariants.filter(v => v.mimeType?.startsWith('video/'))
  const thumbnails = allVariants.filter(v => v.mimeType?.startsWith('image/'))

  // Also collect standalone image URLs
  imetaTags.forEach(tag => {
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i]
      if (part.startsWith('image ')) {
        const imageUrl = part.substring(6).trim()
        if (imageUrl && !thumbnails.some(t => t.url === imageUrl)) {
          thumbnails.push({ url: imageUrl, fallbackUrls: [] } as VideoVariant)
        }
      }
    }
  })

  // Sort by quality (highest first)
  videoVariants.sort((a, b) => {
    const qA = extractNumericQuality(a)
    const qB = extractNumericQuality(b)
    return qB - qA
  })

  // Add quality labels
  videoVariants.forEach(v => {
    const height = extractNumericQuality(v)
    if (height >= 2160) v.quality = '4K'
    else if (height >= 1080) v.quality = '1080p'
    else if (height >= 720) v.quality = '720p'
    else if (height >= 480) v.quality = '480p'
    else if (height >= 360) v.quality = '360p'
    else if (height > 0) v.quality = `${height}p`
  })

  const title =
    event.tags.find(t => t[0] === 'title')?.[1] ||
    event.tags.find(t => t[0] === 'alt')?.[1] ||
    event.content ||
    'Untitled Video'

  const description = event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]

  return {
    id: event.id,
    kind: event.kind,
    title,
    description,
    author: event.pubkey,
    createdAt: event.created_at,
    duration,
    contentWarning,
    videoVariants,
    thumbnails,
  }
}

function parseLegacyFormat(event: NostrEvent): ParsedVideo {
  const url = event.tags.find(t => t[0] === 'url')?.[1] || ''
  const mimeType = event.tags.find(t => t[0] === 'm')?.[1] || 'video/mp4'
  const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || ''
  const title = event.tags.find(t => t[0] === 'title')?.[1] || event.content || 'Untitled Video'
  const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]
  const dimensions = event.tags.find(t => t[0] === 'dim')?.[1]

  const videoVariants: VideoVariant[] = url
    ? [{ url, mimeType, dimensions, fallbackUrls: [] }]
    : []

  const thumbnails = thumb ? [{ url: thumb, fallbackUrls: [] }] : []

  return {
    id: event.id,
    kind: event.kind,
    title,
    description,
    author: event.pubkey,
    createdAt: event.created_at,
    duration,
    contentWarning,
    videoVariants,
    thumbnails,
  }
}

function parseImetaTag(imetaTag: string[]): VideoVariant | null {
  const data: Partial<VideoVariant> = { fallbackUrls: [] }

  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i]
    const spaceIndex = part.indexOf(' ')
    if (spaceIndex === -1) continue

    const key = part.substring(0, spaceIndex)
    const value = part.substring(spaceIndex + 1).trim()

    if (key === 'url') data.url = value
    else if (key === 'm') data.mimeType = value
    else if (key === 'dim') data.dimensions = value
    else if (key === 'size') data.size = parseInt(value, 10)
    else if (key === 'x') data.hash = value
    else if (key === 'fallback' || key === 'mirror') {
      data.fallbackUrls!.push(value)
    }
  }

  if (!data.url) return null
  return data as VideoVariant
}

function extractNumericQuality(variant: VideoVariant): number {
  if (variant.dimensions) {
    const match = variant.dimensions.match(/x(\d+)/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

/**
 * Select best video variant based on quality preference
 */
export function selectVideoVariant(
  variants: VideoVariant[],
  preferredQuality: string = 'auto'
): VideoVariant | null {
  if (!variants || variants.length === 0) return null

  if (preferredQuality === 'auto') return variants[0]

  const targetQuality = parseInt(preferredQuality, 10)
  if (isNaN(targetQuality)) return variants[0]

  let bestMatch = variants[0]
  let bestDiff = Math.abs(extractNumericQuality(bestMatch) - targetQuality)

  for (const variant of variants) {
    const quality = extractNumericQuality(variant)
    const diff = Math.abs(quality - targetQuality)
    if (diff < bestDiff) {
      bestMatch = variant
      bestDiff = diff
    }
  }

  return bestMatch
}

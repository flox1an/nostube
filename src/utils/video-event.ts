import type { ReportedPubkeys } from '@/hooks'
import { getTypeForKind, type VideoType } from '@/lib/video-types'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
import { nip19 } from 'nostr-tools'
import type { BlossomServer } from '@/contexts/AppContext'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { generateMediaUrls } from '@/lib/media-url-generator'

// Define a simple Event interface that matches what we need
interface Event {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export type TextTrack = {
  lang: string
  url: string
}

export type VideoOrigin = {
  platform: string
  externalId: string
  originalUrl?: string
  metadata?: string
}

export type VideoVariant = {
  url: string
  hash?: string // SHA256
  size?: number // bytes
  dimensions?: string // e.g., "1920x1080"
  mimeType?: string
  quality?: string // e.g., "1080p", "720p", "480p"
  fallbackUrls: string[] // fallback URLs for this variant
  blurhash?: string // for thumbnails
}

export interface VideoEvent {
  id: string
  kind: number
  identifier?: string
  title: string
  description: string
  images: string[]
  pubkey: string
  created_at: number
  duration: number
  tags: string[]
  searchText: string
  urls: string[]
  mimeType?: string
  dimensions?: string
  size?: number
  link: string
  type: VideoType
  textTracks: TextTrack[]
  contentWarning: string | undefined
  x?: string
  origin?: VideoOrigin
  // New fields for multi-video support
  videoVariants: VideoVariant[] // All video variants (different qualities)
  thumbnailVariants: VideoVariant[] // All thumbnail variants
}

// Create an in-memory index for fast text search
function createSearchIndex(video: VideoEvent): string {
  return `${video.title} ${video.description} ${video.tags.join(' ')}`.toLowerCase()
}

/**
 * Extract SHA256 hash and file extension from a Blossom URL
 * Blossom URLs have format: https://server.com/{sha256}.{ext}
 */
export function extractBlossomHash(url: string): { sha256?: string; ext?: string } {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname

    // Extract filename from path
    const filename = pathname.split('/').pop() || ''

    // Check if it looks like a Blossom URL (64 char hex hash + extension)
    const match = filename.match(/^([a-f0-9]{64})\.([^.]+)$/i)
    if (match) {
      return {
        sha256: match[1],
        ext: match[2],
      }
    }

    return {}
  } catch {
    return {}
  }
}

/**
 * Parse an imeta tag into a VideoVariant
 */
function parseImetaTag(imetaTag: string[]): VideoVariant | null {
  const imetaValues = new Map<string, string[]>()

  // Parse all key-value pairs in the imeta tag
  for (let i = 1; i < imetaTag.length; i++) {
    const firstSpace = imetaTag[i].indexOf(' ')
    let key: string | undefined, value: string | undefined
    if (firstSpace !== -1) {
      key = imetaTag[i].slice(0, firstSpace)
      value = imetaTag[i].slice(firstSpace + 1)
    } else {
      key = imetaTag[i]
      value = undefined
    }
    if (key && value) {
      if (!imetaValues.has(key)) {
        imetaValues.set(key, [value])
      } else {
        imetaValues.get(key)!.push(value)
      }
    }
  }

  const url = imetaValues.get('url')?.[0]
  if (!url) return null

  // Clean up URL if it has space (malformed events)
  const cleanUrl = url.includes(' ') ? url.split(' ')[0] : url

  const mimeType = imetaValues.get('m')?.[0]
  const dimensions = imetaValues.get('dim')?.[0]
  const size = imetaValues.get('size')?.[0] ? parseInt(imetaValues.get('size')![0]) : undefined
  const hash = imetaValues.get('x')?.[0]
  const blurhash = imetaValues.get('blurhash')?.[0]

  // Collect fallback URLs
  const fallbackUrls: string[] = []
  imetaValues.get('fallback')?.forEach(url => fallbackUrls.push(url))
  imetaValues.get('mirror')?.forEach(url => fallbackUrls.push(url))

  // Extract quality from dimensions (e.g., "1920x1080" -> "1080p")
  let quality: string | undefined
  if (dimensions) {
    const match = dimensions.match(/x(\d+)/)
    if (match) {
      quality = `${match[1]}p`
    }
  }

  return {
    url: cleanUrl,
    hash,
    size,
    dimensions,
    mimeType,
    quality,
    fallbackUrls,
    blurhash,
  }
}

/**
 * Sort video variants by quality (highest first)
 */
function sortVideoVariantsByQuality(variants: VideoVariant[]): VideoVariant[] {
  return variants.sort((a, b) => {
    // Extract numeric quality (e.g., "1080p" -> 1080)
    const getNumericQuality = (v: VideoVariant): number => {
      if (v.quality) {
        const match = v.quality.match(/(\d+)/)
        if (match) return parseInt(match[1])
      }
      if (v.dimensions) {
        const match = v.dimensions.match(/x(\d+)/)
        if (match) return parseInt(match[1])
      }
      return 0
    }

    const qualityA = getNumericQuality(a)
    const qualityB = getNumericQuality(b)

    // Higher quality first
    return qualityB - qualityA
  })
}

/**
 * Generate NIP-19 encoded link for a video event
 * Addressable events (kinds 34235, 34236) use naddr
 * Regular events (kinds 21, 22) use nevent
 */
function generateEventLink(event: Event, identifier: string | undefined, relays: string[]): string {
  const isAddressable = event.kind === 34235 || event.kind === 34236

  if (isAddressable && identifier) {
    return nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier,
      relays,
    })
  }

  return nip19.neventEncode({
    kind: event.kind,
    id: event.id,
    author: event.pubkey,
    relays,
  })
}

// Deprecated functions removed - use generateMediaUrls from @/lib/media-url-generator instead
// Process Nostr events into cache entries
export function processEvents(
  events: (Event | undefined)[],
  relays: string[],
  blockPubkeys?: ReportedPubkeys,
  blossomServers?: BlossomServer[],
  missingVideoIds?: Set<string>
): VideoEvent[] {
  return events
    .filter((event): event is Event => event !== undefined)
    .map(event => processEvent(event, relays, blossomServers))
    .filter(
      (video): video is VideoEvent =>
        video !== undefined &&
        Boolean(video.id) &&
        Boolean(video.urls) &&
        video?.urls !== undefined &&
        video.urls[0]?.indexOf('youtube.com') < 0 &&
        (!blockPubkeys || !blockPubkeys[video.pubkey]) &&
        (!missingVideoIds || !missingVideoIds.has(video.id))
    )
}

export function processEvent(
  event: Event,
  relays: string[],
  blossomServers?: BlossomServer[]
): VideoEvent | undefined {
  // Get relays from applesauce's seenRelays tracking
  const seenRelays = getSeenRelays(event)
  const eventRelays = seenRelays ? Array.from(seenRelays) : relays

  // Find ALL imeta tags
  const imetaTags = event.tags.filter(t => t[0] === 'imeta')
  const contentWarning = event.tags.find(t => t[0] == 'content-warning')?.[1]

  if (imetaTags.length > 0) {
    // Parse all imeta tags
    const allVariants = imetaTags
      .map(tag => parseImetaTag(tag))
      .filter((v): v is VideoVariant => v !== null)

    // Extract thumbnail variants from 'image' fields in imeta tags
    // Multiple 'image' fields in the same imeta tag are fallback URLs for the SAME thumbnail
    const thumbnailsFromImeta: VideoVariant[] = []
    for (const imetaTag of imetaTags) {
      const imageUrls: string[] = []
      for (let i = 1; i < imetaTag.length; i++) {
        const firstSpace = imetaTag[i].indexOf(' ')
        if (firstSpace !== -1) {
          const key = imetaTag[i].slice(0, firstSpace)
          const value = imetaTag[i].slice(firstSpace + 1)
          if (key === 'image' && value) {
            imageUrls.push(value)
          }
        }
      }
      // Create a single thumbnail variant with first URL as primary and rest as fallbacks
      if (imageUrls.length > 0) {
        thumbnailsFromImeta.push({
          url: imageUrls[0],
          fallbackUrls: imageUrls.slice(1),
          mimeType: 'image/jpeg', // Default mime type for images
        })
      }
    }

    // Separate video variants from thumbnail variants
    const videoVariants = sortVideoVariantsByQuality(
      allVariants.filter(v => v.mimeType?.startsWith('video/'))
    )
    const thumbnailVariants = [
      ...allVariants.filter(v => v.mimeType?.startsWith('image/')),
      ...thumbnailsFromImeta,
    ]

    // For backward compatibility, use first imeta tag data
    const imetaTag = imetaTags[0]
    // Parse imeta tag values
    const imetaValues = new Map<string, string[]>()
    for (let i = 1; i < imetaTag.length; i++) {
      const firstSpace = imetaTag[i].indexOf(' ')
      let key: string | undefined, value: string | undefined
      if (firstSpace !== -1) {
        key = imetaTag[i].slice(0, firstSpace)
        value = imetaTag[i].slice(firstSpace + 1)
      } else {
        key = imetaTag[i]
        value = undefined
      }
      if (key && value) {
        if (!imetaValues.has(key)) {
          imetaValues.set(key, [value])
        } else {
          imetaValues.get(key)!.push(value)
        }
      }
    }

    let url = imetaValues.get('url')?.[0]
    const mimeType: string | undefined = imetaValues.get('m')?.[0]

    const images: string[] = []
    imetaValues.get('image')?.forEach(url => images.push(url))

    const videoUrls: string[] = url ? [url] : []
    imetaValues.get('fallback')?.forEach(url => videoUrls.push(url))
    // mirror is bullshit, AI has created fuxx0rd events. Remove soon:
    imetaValues.get('mirror')?.forEach(url => videoUrls.push(url))

    const alt = imetaValues.get('alt')?.[0] || event.content || ''
    const blurhash = imetaValues.get('blurhash')?.[0]
    const x = imetaValues.get('x')?.[0]

    const tags = event.tags.filter(t => t[0] === 't').map(t => t[1])
    const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0')
    const identifier = event.tags.find(t => t[0] === 'd')?.[1]

    // Extract origin tag if present
    const originTag = event.tags.find(t => t[0] === 'origin')
    const origin: VideoOrigin | undefined = originTag
      ? {
          platform: originTag[1],
          externalId: originTag[2],
          originalUrl: originTag[3],
          metadata: originTag[4],
        }
      : undefined

    // Only process if it's a video
    //if (!url || !mimeType?.startsWith('video/')) return null;

    const textTracks: TextTrack[] = []
    const textTrackTags = event.tags.filter(t => t[0] === 'text-track')
    textTrackTags.forEach(vtt => {
      // eslint-disable-next-line prefer-const
      let [, url, lang] = vtt
      // Generate mirror URLs if the URL is a Blossom URL and mirror servers are configured
      if (url && blossomServers && blossomServers.length > 0) {
        const mirrorServers = blossomServers.filter(server => server.tags.includes('mirror'))
        if (mirrorServers.length > 0) {
          const { urls: generatedUrls } = generateMediaUrls({
            urls: [url],
            mediaType: 'vtt',
            blossomServers: mirrorServers,
          })
          // Use first mirror URL if available, otherwise use original
          if (generatedUrls.length > 0) {
            url = generatedUrls[0]
          }
        }
      }
      textTracks.push({ url, lang })
    })

    // There are some events that have the whole imeta data in the first string.
    if (url && url.includes(' ')) {
      console.warn('URL with space', url, event)
      url = url.split(' ')[0]
    }

    // NOTE: URL generation (mirrors, proxies) is now handled by useMediaUrls hook in VideoPlayer
    // We just pass the raw video URLs here
    // Flatten video variants into URLs array (quality-sorted, highest first)
    const finalUrls: string[] = []
    for (const variant of videoVariants) {
      finalUrls.push(variant.url)
      finalUrls.push(...variant.fallbackUrls)
    }

    // Get mime type and dimensions from highest quality variant (first one)
    const primaryVariant = videoVariants[0]
    const primaryMimeType = primaryVariant?.mimeType || mimeType
    const primaryDimensions = primaryVariant?.dimensions

    const videoEvent: VideoEvent = {
      id: event.id,
      kind: event.kind,
      identifier,
      title: event.tags.find(t => t[0] === 'title')?.[1] || alt,
      description: event.content || '',
      images: images.length > 0 ? images : [url || blurHashToDataURL(blurhash) || ''], // use the video url, which is converted to an image by the image proxy
      pubkey: event.pubkey,
      created_at: event.created_at,
      duration,
      x: primaryVariant?.hash || x,
      tags,
      searchText: '',
      urls: finalUrls,
      mimeType: primaryMimeType,
      dimensions: primaryDimensions,
      textTracks,
      link: generateEventLink(event, identifier, eventRelays),
      type: getTypeForKind(event.kind),
      contentWarning,
      origin,
      videoVariants,
      thumbnailVariants,
    }

    // Create search index
    videoEvent.searchText = createSearchIndex(videoEvent)

    return videoEvent
  } else {
    // Fall back to old format
    const title = event.tags.find(t => t[0] === 'title')?.[1] || ''
    const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || ''
    const thumb = event.tags.find(t => t[0] === 'thumb')?.[1]
    const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0')
    const identifier = event.tags.find(t => t[0] === 'd')?.[1] || ''
    const tags = event.tags.filter(t => t[0] === 't').map(t => t[1])
    let url = event.tags.find(t => t[0] === 'url')?.[1] || ''
    const mimeType = event.tags.find(t => t[0] === 'm')?.[1] || ''

    // Extract origin tag if present
    const originTag = event.tags.find(t => t[0] === 'origin')
    const origin: VideoOrigin | undefined = originTag
      ? {
          platform: originTag[1],
          externalId: originTag[2],
          originalUrl: originTag[3],
          metadata: originTag[4],
        }
      : undefined

    // There are some events that have the whole imeta data in the first string.
    if (url.includes(' ')) {
      console.warn('URL with space', url, event)
      url = url.split(' ')[0]
    }

    // NOTE: URL generation (mirrors, proxies) is now handled by useMediaUrls hook in VideoPlayer
    // We just pass the raw video URL here
    const finalUrls = [url]

    // For old format, create single video variant
    const dimensions = event.tags.find(t => t[0] === 'dim')?.[1]
    const size = parseInt(event.tags.find(t => t[0] === 'size')?.[1] || '0')
    const x = event.tags.find(t => t[0] === 'x')?.[1]

    const videoVariants: VideoVariant[] = url
      ? [
          {
            url,
            hash: x,
            size: size || undefined,
            dimensions,
            mimeType,
            fallbackUrls: [],
          },
        ]
      : []

    const thumbnailVariants: VideoVariant[] = thumb
      ? [
          {
            url: thumb,
            fallbackUrls: [],
          },
        ]
      : []

    const videoEvent: VideoEvent = {
      id: event.id,
      kind: event.kind,
      identifier,
      title,
      description,
      images: [thumb || url], // use the video url, which is converted to an image by the image proxy
      pubkey: event.pubkey,
      created_at: event.created_at,
      duration,
      tags,
      searchText: '',
      urls: finalUrls,
      textTracks: [],
      mimeType,
      dimensions,
      size: size || undefined,
      x,
      link: generateEventLink(event, identifier, eventRelays),
      type: getTypeForKind(event.kind),
      contentWarning,
      origin,
      videoVariants,
      thumbnailVariants,
    }

    // Create search index
    videoEvent.searchText = createSearchIndex(videoEvent)

    return videoEvent
  }
}

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
  // First check for imeta tag
  const imetaTag = event.tags.find(t => t[0] === 'imeta')
  const contentWarning = event.tags.find(t => t[0] == 'content-warning')?.[1]

  if (imetaTag) {
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
    const finalUrls = videoUrls

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
      x,
      tags,
      searchText: '',
      urls: finalUrls,
      mimeType,
      textTracks,
      link: nip19.neventEncode({
        kind: event.kind,
        id: event.id,
        relays: eventRelays,
      }),
      type: getTypeForKind(event.kind),
      contentWarning,
      origin,
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
      dimensions: event.tags.find(t => t[0] === 'dim')?.[1],
      size: parseInt(event.tags.find(t => t[0] === 'size')?.[1] || '0'),
      link: nip19.neventEncode({
        kind: event.kind,
        id: event.id,
        relays: eventRelays,
      }),
      type: getTypeForKind(event.kind),
      contentWarning,
      origin,
    }

    // Create search index
    videoEvent.searchText = createSearchIndex(videoEvent)

    return videoEvent
  }
}

import { ReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { getTypeForKind, VideoType } from '@/lib/video-types'
import { blurHashToDataURL } from '@/workers/blurhashDataURL'
import { nip19 } from 'nostr-tools'
import type { BlossomServer } from '@/contexts/AppContext'

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
}

// Create an in-memory index for fast text search
function createSearchIndex(video: VideoEvent): string {
  return `${video.title} ${video.description} ${video.tags.join(' ')}`.toLowerCase()
}

/**
 * Extract SHA256 hash and file extension from a Blossom URL
 * Blossom URLs have format: https://server.com/{sha256}.{ext}
 */
function extractBlossomHash(url: string): { sha256?: string; ext?: string } {
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
 * Generate proxy URLs for video URLs when proxy servers are configured
 * Format: https://proxyserver.com/{sha256}.{ext}?origin={originalUrl}
 */
function generateProxyUrls(
  originalUrls: string[],
  proxyServers: BlossomServer[]
): string[] {
  if (proxyServers.length === 0) return []
  
  const proxyUrls: string[] = []
  
  for (const originalUrl of originalUrls) {
    // Try to extract SHA256 from the URL
    const { sha256, ext } = extractBlossomHash(originalUrl)
    
    if (sha256 && ext) {
      // Generate proxy URLs for each proxy server
      for (const proxyServer of proxyServers) {
        // Ensure proxy server URL doesn't end with /
        const baseUrl = proxyServer.url.replace(/\/$/, '')
        const proxyUrl = `${baseUrl}/${sha256}.${ext}?origin=${encodeURIComponent(originalUrl)}`
        proxyUrls.push(proxyUrl)
      }
    }
  }
  
  return proxyUrls
}
// Process Nostr events into cache entries
export function processEvents(
  events: (Event | undefined)[],
  relays: string[],
  blockPubkeys?: ReportedPubkeys,
  blossomServers?: BlossomServer[]
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
        (!blockPubkeys || !blockPubkeys[video.pubkey])
    )
}

export function processEvent(
  event: Event,
  relays: string[],
  blossomServers?: BlossomServer[]
): VideoEvent | undefined {
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
    // Only process if it's a video
    //if (!url || !mimeType?.startsWith('video/')) return null;

    const textTracks: TextTrack[] = []
    const textTrackTags = event.tags.filter(t => t[0] === 'text-track')
    textTrackTags.forEach(vtt => {
      const [_, url, lang] = vtt
      textTracks.push({ url, lang })
    })

    // There are some events that have the whole imeta data in the first string.
    if (url && url.includes(' ')) {
      console.warn('URL with space', url, event)
      url = url.split(' ')[0]
    }

    const videoUrls2 = videoUrls.map(url => {
      if (url.includes('https://temp-st.apps2.slidestr.net/')) {
        return url.replace('https://temp-st.apps2.slidestr.net/', 'https://almond.slidestr.net/')
      }
      return url
    })

    // Generate proxy URLs if proxy servers are configured
    let finalUrls = videoUrls2
    if (blossomServers && blossomServers.length > 0) {
      const proxyServers = blossomServers.filter(server => server.tags.includes('proxy'))
      if (proxyServers.length > 0) {
        const proxyUrls = generateProxyUrls(videoUrls2, proxyServers)
        // Prepend proxy URLs before original URLs
        finalUrls = [...proxyUrls, ...videoUrls2]
      }
    }

    const videoEvent: VideoEvent = {
      id: event.id,
      kind: event.kind,
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
        relays,
      }),
      type: getTypeForKind(event.kind),
      contentWarning,
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

    // There are some events that have the whole imeta data in the first string.
    if (url.includes(' ')) {
      console.warn('URL with space', url, event)
      url = url.split(' ')[0]
    }

    // Generate proxy URLs if proxy servers are configured
    let finalUrls = [url]
    if (blossomServers && blossomServers.length > 0) {
      const proxyServers = blossomServers.filter(server => server.tags.includes('proxy'))
      if (proxyServers.length > 0) {
        const proxyUrls = generateProxyUrls([url], proxyServers)
        // Prepend proxy URLs before original URLs
        finalUrls = [...proxyUrls, url]
      }
    }

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
        relays,
      }),
      type: getTypeForKind(event.kind),
      contentWarning,
    }

    // Create search index
    videoEvent.searchText = createSearchIndex(videoEvent)

    return videoEvent
  }
}

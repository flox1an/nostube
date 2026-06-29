import { nip19 } from 'nostr-tools'
import type { VideoEvent, VideoVariant } from '@/utils/video-event'
import { getTypeForKind } from '@/lib/video-types'

export const SEARCH_SERVICE_URL = 'https://nostube-search.apps2.slidestr.net'

export interface ExternalSearchHit {
  event_id: string
  title: string
  content_preview: string
  pubkey: string
  kind: number
  created_at: number
  published_at?: number | null
  duration?: number | null
  thumbnail: string | null
  videoUrl: string | null
  tags: string[]
  mimeType?: string | null
  mediaType?: 'video' | 'audio' | null
  dimensions?: string | null
  textTracks?: Array<{ url: string; lang?: string | null }>
  contentWarning?: string | null
}

export function mapExternalHitToVideoEvent(hit: ExternalSearchHit): VideoEvent {
  const type = getTypeForKind(hit.kind)
  const videoVariants: VideoVariant[] = hit.videoUrl
    ? [{ url: hit.videoUrl, fallbackUrls: [] }]
    : []
  const thumbnailVariants: VideoVariant[] = hit.thumbnail
    ? [{ url: hit.thumbnail, fallbackUrls: [], mediaType: 'image' as const }]
    : []
  return {
    id: hit.event_id,
    kind: hit.kind,
    title: hit.title,
    description: hit.content_preview,
    images: hit.thumbnail ? [hit.thumbnail] : [],
    pubkey: hit.pubkey,
    created_at: hit.created_at,
    published_at: hit.published_at ?? undefined,
    duration: hit.duration ?? 0,
    tags: Array.isArray(hit.tags) ? hit.tags : [],
    searchText: `${hit.title} ${hit.content_preview}`,
    urls: hit.videoUrl ? [hit.videoUrl] : [],
    mimeType: hit.mimeType ?? undefined,
    mediaType: hit.mediaType ?? undefined,
    dimensions: hit.dimensions ?? undefined,
    link: nip19.neventEncode({ kind: hit.kind, id: hit.event_id, author: hit.pubkey, relays: [] }),
    type,
    textTracks: (hit.textTracks ?? [])
      .filter(t => t.lang)
      .map(t => ({ url: t.url, lang: t.lang! })),
    contentWarning: hit.contentWarning ?? undefined,
    origins: [],
    videoVariants,
    thumbnailVariants,
  }
}

export async function fetchExternalSearchResults(
  query: string,
  signal: AbortSignal,
  serviceUrl: string = SEARCH_SERVICE_URL
): Promise<VideoEvent[] | null> {
  try {
    const url = `${serviceUrl}/api/search?q=${encodeURIComponent(query)}&limit=50`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as { hits: ExternalSearchHit[] }
    return (data.hits ?? []).map(mapExternalHitToVideoEvent)
  } catch {
    return null
  }
}

export async function fetchTagResults(
  tag: string,
  signal: AbortSignal,
  serviceUrl: string = SEARCH_SERVICE_URL,
  limit = 100
): Promise<VideoEvent[] | null> {
  try {
    const url = `${serviceUrl}/api/tags?t=${encodeURIComponent(tag.toLowerCase())}&limit=${limit}`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as { hits: ExternalSearchHit[] }
    return (data.hits ?? []).map(mapExternalHitToVideoEvent)
  } catch {
    return null
  }
}

export interface PeopleHit {
  pubkey: string
  npub: string
  name: string | null
  display_name: string | null
  username: string | null
  about: string | null
  picture: string | null
  nip05: string | null
  lud16: string | null
  videoCount: number
  globalTrustScore: number
}

export async function fetchPeopleResults(
  query: string,
  signal: AbortSignal,
  serviceUrl: string = SEARCH_SERVICE_URL,
  limit = 10
): Promise<PeopleHit[] | null> {
  try {
    const url = `${serviceUrl}/api/people?q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = (await res.json()) as { hits: PeopleHit[] }
    return data.hits ?? []
  } catch {
    return null
  }
}

import { nip19 } from 'nostr-tools'
import type { TextTrack, VideoEvent, VideoVariant } from '@/utils/video-event'
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
  authorDisplayName: string | null
  rankingScore: number
  nostrUrl: string
  contentWarning?: string | null
  textTracks?: TextTrack[]
  dimensions?: string | null
  mimeType?: string | null
  mediaType?: 'video' | 'audio' | null
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
    textTracks: hit.textTracks ?? [],
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

import { nip19 } from 'nostr-tools'
import type { VideoEvent, VideoVariant } from '@/utils/video-event'
import { getTypeForKind } from '@/lib/video-types'
import { isAllowedEventMediaUrl } from '@/lib/media-url-policy'

export const SEARCH_SERVICE_URL = 'https://nostube-search.apps2.slidestr.net'

export type SearchErrorCode = 'preset_unavailable'

/**
 * Result of an external search API call.
 * `ok: true` with `data` on success.
 * `ok: false` with optional `code` on error.
 */
export type SearchResult<T> = { ok: true; data: T[] } | { ok: false; code?: SearchErrorCode }

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
  const safeVideoUrl = hit.videoUrl && isAllowedEventMediaUrl(hit.videoUrl) ? hit.videoUrl : null
  const safeThumbnail =
    hit.thumbnail && isAllowedEventMediaUrl(hit.thumbnail) ? hit.thumbnail : null
  const videoVariants: VideoVariant[] = safeVideoUrl
    ? [{ url: safeVideoUrl, fallbackUrls: [] }]
    : []
  const thumbnailVariants: VideoVariant[] = safeThumbnail
    ? [{ url: safeThumbnail, fallbackUrls: [], mediaType: 'image' as const }]
    : []
  return {
    id: hit.event_id,
    kind: hit.kind,
    title: hit.title,
    description: hit.content_preview,
    images: safeThumbnail ? [safeThumbnail] : [],
    pubkey: hit.pubkey,
    created_at: hit.created_at,
    published_at: hit.published_at ?? undefined,
    duration: hit.duration ?? 0,
    tags: Array.isArray(hit.tags) ? hit.tags : [],
    searchText: `${hit.title} ${hit.content_preview}`,
    urls: safeVideoUrl ? [safeVideoUrl] : [],
    sourceUrls: hit.videoUrl ? [hit.videoUrl] : [],
    mediaSourceStatus: safeVideoUrl ? 'safe-declared-source' : 'unavailable',
    blockedEventMediaUrlCount: [hit.videoUrl, hit.thumbnail]
      .filter((candidate): candidate is string => Boolean(candidate))
      .filter(candidate => !isAllowedEventMediaUrl(candidate)).length,
    mimeType: hit.mimeType ?? undefined,
    mediaType: hit.mediaType ?? undefined,
    dimensions: hit.dimensions ?? undefined,
    link: nip19.neventEncode({ kind: hit.kind, id: hit.event_id, author: hit.pubkey, relays: [] }),
    type,
    textTracks: (hit.textTracks ?? [])
      .filter(t => t.lang && isAllowedEventMediaUrl(t.url))
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
  serviceUrl: string,
  presetPubkey: string,
  nsfwFilter: string
): Promise<SearchResult<VideoEvent>> {
  try {
    const url = `${serviceUrl}/api/search?q=${encodeURIComponent(query)}&limit=50&presetPubkey=${encodeURIComponent(presetPubkey)}&nsfwFilter=${encodeURIComponent(nsfwFilter)}`
    const res = await fetch(url, { signal })
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      if (body?.code === 'preset_unavailable') return { ok: false, code: 'preset_unavailable' }
    }
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { hits: ExternalSearchHit[] }
    return { ok: true, data: (data.hits ?? []).map(mapExternalHitToVideoEvent) }
  } catch {
    return { ok: false }
  }
}

export async function fetchTagResults(
  tag: string,
  signal: AbortSignal,
  serviceUrl: string,
  presetPubkey: string,
  nsfwFilter: string,
  limit = 100
): Promise<SearchResult<VideoEvent>> {
  try {
    const url = `${serviceUrl}/api/tags?t=${encodeURIComponent(tag.toLowerCase())}&limit=${limit}&presetPubkey=${encodeURIComponent(presetPubkey)}&nsfwFilter=${encodeURIComponent(nsfwFilter)}`
    const res = await fetch(url, { signal })
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      if (body?.code === 'preset_unavailable') return { ok: false, code: 'preset_unavailable' }
    }
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { hits: ExternalSearchHit[] }
    return { ok: true, data: (data.hits ?? []).map(mapExternalHitToVideoEvent) }
  } catch {
    return { ok: false }
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
  serviceUrl: string,
  presetPubkey: string,
  nsfwFilter: string,
  limit = 10
): Promise<SearchResult<PeopleHit>> {
  try {
    const url = `${serviceUrl}/api/people?q=${encodeURIComponent(query)}&limit=${limit}&presetPubkey=${encodeURIComponent(presetPubkey)}&nsfwFilter=${encodeURIComponent(nsfwFilter)}`
    const res = await fetch(url, { signal })
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}))
      if (body?.code === 'preset_unavailable') return { ok: false, code: 'preset_unavailable' }
    }
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { hits: PeopleHit[] }
    return { ok: true, data: data.hits ?? [] }
  } catch {
    return { ok: false }
  }
}

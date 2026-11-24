import { extractBlossomHash } from './blossom-url'

export const HLS_CAST_CONTENT_TYPE = 'application/vnd.apple.mpegurl'
export const MP4_CAST_CONTENT_TYPE = 'video/mp4'

export type CastContentType = typeof HLS_CAST_CONTENT_TYPE | typeof MP4_CAST_CONTENT_TYPE
export type HlsSegmentFormat = 'fmp4' | 'ts'

/** A video as a cast receiver loads it: by URL, straight from the media server. */
export interface CastMediaSource {
  url: string
  /** The same media on other servers, tried in order when the receiver cannot load `url`. */
  fallbackUrls: string[]
  contentType: CastContentType
  title?: string
  thumbnailUrl?: string
  live?: boolean
}

// Each attempt can cost the receiver a playlist timeout; three servers is plenty.
const MAX_CAST_URLS = 3

const HLS_MIME_TYPES = new Set(['application/vnd.apple.mpegurl', 'application/x-mpegurl'])
const MP4_MIME_TYPES = new Set(['video/mp4', 'video/x-m4v'])

/**
 * Whether a receiver on the viewer's network can fetch this URL on its own: plain
 * HTTP(S) without credentials, not this device's loopback and not a FIPS mesh name.
 * Rejects blob:, data: and MediaSource object URLs. Private LAN addresses stay
 * allowed: a TV on the same network reaches a LAN Blossom server.
 */
export function isRemotelyPlayableUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return !(
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.fips') ||
    host === '::1' ||
    /^127\./.test(host)
  )
}

/** HLS or MP4 by the event's mime type; without one, by the URL's file extension. */
export function castContentType(mime: string, url: string): CastContentType | undefined {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (HLS_MIME_TYPES.has(base)) return HLS_CAST_CONTENT_TYPE
  if (MP4_MIME_TYPES.has(base)) return MP4_CAST_CONTENT_TYPE
  if (base && base !== 'video/*' && base !== 'application/octet-stream') return undefined

  let path: string
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    return undefined
  }
  if (path.endsWith('.m3u8')) return HLS_CAST_CONTENT_TYPE
  if (path.endsWith('.mp4') || path.endsWith('.m4v')) return MP4_CAST_CONTENT_TYPE
  return undefined
}

interface ResolveCastSourceOptions {
  /**
   * Candidate URLs in playback order: the URL playing locally first, then other
   * known-good URLs. Only those holding the same Blossom blob as the first become
   * fallbacks, so every attempt plays the same file with the same content type.
   */
  urls: (string | null | undefined)[]
  mime: string
  title?: string
  thumbnailUrl?: string
  live?: boolean
}

/**
 * The cast source for a video, or undefined when no receiver could play it on its
 * own (DASH, WebM, blob URLs, loopback-only servers).
 */
export function resolveCastSource({
  urls,
  mime,
  title,
  thumbnailUrl,
  live,
}: ResolveCastSourceOptions): CastMediaSource | undefined {
  const [url, ...rest] = [
    ...new Set(urls.filter((url): url is string => !!url && isRemotelyPlayableUrl(url))),
  ]
  if (!url) return undefined
  const contentType = castContentType(mime, url)
  if (!contentType) return undefined
  const { sha256 } = extractBlossomHash(url)
  const mirrors = sha256 ? rest.filter(other => extractBlossomHash(other).sha256 === sha256) : []
  return {
    url,
    fallbackUrls: mirrors.slice(0, MAX_CAST_URLS - 1),
    contentType,
    title,
    thumbnailUrl: thumbnailUrl && isRemotelyPlayableUrl(thumbnailUrl) ? thumbnailUrl : undefined,
    live,
  }
}

/**
 * Whether the receiver's media is one of these URLs, or the same Blossom blob on
 * another server (a session resumed after a reload may play a different mirror).
 */
export function isSameCastMedia(mediaUrl: string | undefined, urls: string[]): boolean {
  if (!mediaUrl) return false
  if (urls.includes(mediaUrl)) return true
  const { sha256 } = extractBlossomHash(mediaUrl)
  return !!sha256 && urls.some(url => extractBlossomHash(url).sha256 === sha256)
}

/**
 * Segment container of an HLS stream, read from its playlists. Google's Default Media
 * Receiver assumes MPEG-TS and needs an explicit hint for fragmented MP4. Undefined
 * when the playlist cannot be read; the receiver then uses its default.
 */
export async function detectHlsSegmentFormat(
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<HlsSegmentFormat | undefined> {
  try {
    let playlistUrl = url
    // Master playlist, then its first variant.
    for (let depth = 0; depth < 2; depth += 1) {
      const response = await fetchFn(playlistUrl)
      if (!response.ok) return undefined
      const lines = (await response.text()).split(/\r?\n/).map(line => line.trim())
      if (lines.some(line => line.startsWith('#EXT-X-MAP'))) return 'fmp4'
      const streamInf = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF'))
      if (streamInf === -1) return lines.some(line => line.startsWith('#EXTINF')) ? 'ts' : undefined
      const variant = lines.slice(streamInf + 1).find(line => line && !line.startsWith('#'))
      if (!variant) return undefined
      playlistUrl = new URL(variant, playlistUrl).href
    }
  } catch {
    // CORS or network failure: leave the format to the receiver.
  }
  return undefined
}

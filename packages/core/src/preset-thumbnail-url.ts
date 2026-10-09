import { getImgproxyBaseUrl } from './imgproxy-config'

export type PresetThumbnailPreset = 'feed-preview-v1' | 'profile-avatar-v1' | 'embed-card-v1'

/** The preset route only honors this many repeated `xs` hints; extras are dropped client-side. */
const MAX_SERVER_HINTS = 4

export interface PresetThumbnailOptions {
  /** Source file extension, used only for server-side video-vs-image detection. */
  extension?: string
  /** Known Blossom server(s) for this blob (hostname or full URL), highest-priority lookup. */
  serverHints?: ReadonlyArray<string | null | undefined>
  /** Author pubkey (hex or npub) for a kind-10063 relay server-list lookup fallback. */
  authorPubkey?: string | null
}

/**
 * Builds the fixed image-proxy URL for hash-addressed Blossom media.
 *
 * The preset route (`deny_unknown_fields`) accepts only `xs` (repeatable server hint)
 * and `as` (author pubkey) as query parameters — nothing else.
 */
export function presetThumbnailUrl(
  baseUrl: string | undefined,
  preset: PresetThumbnailPreset,
  sha256: string,
  options: PresetThumbnailOptions = {}
): string {
  const { extension, serverHints, authorPubkey } = options
  const filename = extension ? `${sha256}.${extension}` : sha256
  const url = new URL(`${getImgproxyBaseUrl(baseUrl)}/v1/preset/${preset}/${filename}`)

  const hints = [
    ...new Set((serverHints ?? []).filter((hint): hint is string => Boolean(hint))),
  ].slice(0, MAX_SERVER_HINTS)
  for (const hint of hints) url.searchParams.append('xs', hint)
  if (authorPubkey) url.searchParams.set('as', authorPubkey)

  return url.toString()
}

/** Visual output for each preset, mirrored as raw imgproxy directives for the `/insecure/` route. */
const PRESET_DIRECTIVES: Record<
  PresetThumbnailPreset,
  { resize: 'fit' | 'fill'; width: number; height: number; quality: number }
> = {
  'feed-preview-v1': { resize: 'fit', width: 480, height: 480, quality: 82 },
  'profile-avatar-v1': { resize: 'fill', width: 160, height: 160, quality: 85 },
  'embed-card-v1': { resize: 'fit', width: 1200, height: 630, quality: 82 },
}

/**
 * Builds a legacy unsigned imgproxy directive URL (`/insecure/f:webp/q:.../rs:.../plain/<url>`)
 * for a non-Blossom source URL, matching the visual output of the given preset.
 *
 * Only usable when the proxy has `ALLOW_UNSIGNED_URLS` enabled. Blossom-hash media MUST use
 * `presetThumbnailUrl` instead — it needs no such server opt-in and never expires.
 */
export function insecureThumbnailUrl(
  baseUrl: string | undefined,
  preset: PresetThumbnailPreset,
  sourceUrl: string
): string {
  const { resize, width, height, quality } = PRESET_DIRECTIVES[preset]
  const directives = `f:webp/q:${quality}/rs:${resize}:${width}:${height}`
  return `${getImgproxyBaseUrl(baseUrl)}/insecure/${directives}/plain/${encodeURIComponent(sourceUrl)}`
}

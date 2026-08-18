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

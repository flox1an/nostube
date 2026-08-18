import { getImgproxyBaseUrl } from './imgproxy-config'

export type PresetThumbnailPreset = 'feed-preview-v1' | 'profile-avatar-v1' | 'embed-card-v1'

/** Builds the fixed image-proxy URL for hash-addressed Blossom media. */
export function presetThumbnailUrl(
  baseUrl: string | undefined,
  preset: PresetThumbnailPreset,
  sha256: string,
  extension?: string
): string {
  const filename = extension ? `${sha256}.${extension}` : sha256
  return `${getImgproxyBaseUrl(baseUrl)}/v1/preset/${preset}/${filename}`
}

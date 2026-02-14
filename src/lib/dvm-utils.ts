import type { VideoVariant } from './video-processing'

/**
 * Available codecs for transcoding
 */
export type TranscodeCodec = 'h264' | 'h265'

/**
 * Resolution to dimension mapping for transcoding
 */
export const RESOLUTION_DIMENSIONS: Record<string, string> = {
  '1080p': '1920x1080',
  '720p': '1280x720',
  '480p': '854x480',
  '360p': '640x360',
  '240p': '426x240',
}

/**
 * Available resolutions for transcoding (ordered high to low)
 */
export const AVAILABLE_RESOLUTIONS = ['1080p', '720p', '480p', '360p', '240p'] as const
export type TranscodeResolution = (typeof AVAILABLE_RESOLUTIONS)[number]

/**
 * Result of transcode check
 */
export interface TranscodeCheckResult {
  needed: boolean
  reason: string
}

/**
 * Check if a video should be offered for transcoding
 *
 * Triggers when:
 * - Resolution exceeds 1080p (either dimension > 1080)
 * - Video codec is problematic: hev1, av01, vp09, vp9
 *
 * Compatible codecs that don't trigger: avc1 (H.264), hvc1 (HEVC variant that works on iOS)
 */
export function shouldOfferTranscode(video: VideoVariant): TranscodeCheckResult {
  const [width, height] = video.dimension.split('x').map(Number)

  if (width > 1080 || height > 1080) {
    return { needed: true, reason: 'Video is higher than 1080p' }
  }

  const codec = video.videoCodec?.toLowerCase() || ''
  const problematicCodecs = ['hev1', 'av01', 'vp09', 'vp9']
  if (problematicCodecs.some(c => codec.startsWith(c))) {
    return { needed: true, reason: 'Video codec may not play on all devices' }
  }

  return { needed: false, reason: '' }
}

/**
 * Parse codecs from a MIME type string
 * e.g., "video/mp4; codecs=\"hvc1,mp4a.40.2\"" -> { videoCodec: "hvc1", audioCodec: "mp4a.40.2" }
 */
export function parseCodecsFromMimetype(mimetype: string): {
  videoCodec?: string
  audioCodec?: string
} {
  const codecsMatch = mimetype.match(/codecs="([^"]+)"/)
  if (!codecsMatch) {
    return {}
  }

  const codecs = codecsMatch[1].split(',').map(c => c.trim())

  // Video codecs typically start with: avc1, hvc1, hev1, av01, vp09, vp9
  const videoCodecPrefixes = ['avc1', 'hvc1', 'hev1', 'av01', 'vp09', 'vp9', 'h264', 'hevc']
  // Audio codecs typically start with: mp4a, opus, flac, aac
  const audioCodecPrefixes = ['mp4a', 'opus', 'flac', 'aac']

  let videoCodec: string | undefined
  let audioCodec: string | undefined

  for (const codec of codecs) {
    const lowerCodec = codec.toLowerCase()
    if (!videoCodec && videoCodecPrefixes.some(p => lowerCodec.startsWith(p))) {
      videoCodec = codec
    } else if (!audioCodec && audioCodecPrefixes.some(p => lowerCodec.startsWith(p))) {
      audioCodec = codec
    }
  }

  return { videoCodec, audioCodec }
}

/**
 * DVM result content structure
 */
export interface DvmResultContent {
  type: string
  urls: string[]
  resolution: string
  size_bytes: number
  mimetype: string
  duration?: number // Duration in seconds (if returned by DVM)
  bitrate?: number // Bitrate in bits per second (if returned by DVM)
}

/**
 * Parse DVM result content JSON
 */
export function parseDvmResultContent(content: string): DvmResultContent | null {
  try {
    return JSON.parse(content) as DvmResultContent
  } catch {
    return null
  }
}

/**
 * DVM handler info from NIP-89 kind:31990
 */
export interface DvmHandlerInfo {
  pubkey: string
  name?: string
  about?: string
  createdAt: number // Add createdAt to sort by newest DVM announcement
}

/**
 * Check if content appears to be NIP-04 encrypted (base64?iv=base64 format)
 */
export function isNip04Encrypted(content: string): boolean {
  return content.includes('?iv=')
}

/**
 * Encrypted content structure for DVM requests
 */
export interface DvmEncryptedContent {
  i: [string, string] // [url, "url"]
  params: string[][] // [["param", "mode", "mp4"], ["param", "resolution", "720p"], ...]
}

/**
 * Encrypted status content structure from DVM
 */
export interface DvmEncryptedStatus {
  status: string
  message?: string | null
  eta?: number | null
}

/**
 * Build encrypted content JSON for DVM request
 */
export function buildDvmEncryptedContent(
  videoUrl: string,
  mode: 'mp4' | 'hls',
  resolution: string,
  codec: TranscodeCodec = 'h264'
): DvmEncryptedContent {
  const params: string[][] = [
    ['param', 'mode', mode],
    ['param', 'codec', codec],
  ]

  // Only add resolution param for MP4 mode
  if (mode === 'mp4') {
    params.push(['param', 'resolution', resolution])
  }

  return {
    i: [videoUrl, 'url'],
    params,
  }
}

/**
 * Parse encrypted status content from DVM
 */
export function parseDvmEncryptedStatus(decryptedContent: string): DvmEncryptedStatus | null {
  try {
    return JSON.parse(decryptedContent) as DvmEncryptedStatus
  } catch {
    return null
  }
}

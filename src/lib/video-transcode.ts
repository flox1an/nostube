import { getCodecsFromFile } from './codec-detection'
import type { VideoCodec } from 'mediabunny'

export const BITRATE_CUTOFF_MBPS = 8
export const PRIMARY_TARGET_HEIGHT = 1080
export const FALLBACK_TARGET_HEIGHT = 480
export const BROWSER_TRANSCODE_1080P_BITRATES = {
  compact: 4_500_000,
  balanced: 6_750_000,
  'high-motion': 9_000_000,
} as const
export const BROWSER_TRANSCODE_1080P_BITRATE = BROWSER_TRANSCODE_1080P_BITRATES.balanced
export const TARGET_1080P_WIDTH = 1920
export const TARGET_FPS = 30
export const HLS_TARGET_DURATION = 4
export const BROWSER_TRANSCODE_AUDIO_BITRATE = 96_000
export const BROWSER_TRANSCODE_BPP =
  BROWSER_TRANSCODE_1080P_BITRATE / (TARGET_1080P_WIDTH * PRIMARY_TARGET_HEIGHT * TARGET_FPS)
export type BrowserTranscodeQualityPreset = keyof typeof BROWSER_TRANSCODE_1080P_BITRATES

const SOURCE_AWARE_MAX_MULTIPLIERS: Record<BrowserTranscodeQualityPreset, number> = {
  compact: 1,
  balanced: 1.35,
  'high-motion': 1.5,
}

export interface TranscodeSourceMeta {
  width: number
  height: number
  duration: number
  sizeMB: number
  bitrateMbps: number
  videoCodec: string | undefined
  mimeType: string
}

export type TranscodeRecommendation = 'none' | 'bitrate' | 'full'

export interface BrowserTranscodeVariant {
  codec: 'hevc' | 'avc'
  targetHeight: number
  format: 'mp4' | 'hls'
  label: string
  passthrough?: boolean
  qualityPreset?: BrowserTranscodeQualityPreset
}

export async function probeTranscodeSource(file: File): Promise<TranscodeSourceMeta> {
  const { width, height, duration } = await probeVideoDimensions(file)

  let videoCodec: string | undefined
  let bitrateMbps = duration > 0 ? (file.size * 8) / (duration * 1_000_000) : 0

  try {
    const codecInfo = await getCodecsFromFile(file)
    videoCodec = codecInfo.videoCodec
    if (codecInfo.bitrate && codecInfo.bitrate > 0) {
      bitrateMbps = codecInfo.bitrate / 1_000_000
    }
  } catch {
    // Codec probing only works reliably for MP4; dimensions/duration above still guide the UI.
  }

  return {
    width,
    height,
    duration,
    sizeMB: file.size / (1024 * 1024),
    bitrateMbps,
    videoCodec,
    mimeType: file.type,
  }
}

async function probeVideoDimensions(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Video metadata timeout')), 10_000)
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      video.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Failed to read video metadata'))
      }
    })

    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function isCompatibleCodec(codec: string | undefined): boolean {
  if (!codec) return false
  const normalized = codec.toLowerCase()
  return (
    normalized.startsWith('avc1') ||
    normalized.startsWith('avc3') ||
    normalized.startsWith('hvc1') ||
    normalized.startsWith('hev1')
  )
}

function isMp4Container(mimeType: string): boolean {
  return mimeType === 'video/mp4' || mimeType === 'video/x-m4v'
}

export function canUseOriginalHlsVariant(meta: TranscodeSourceMeta): boolean {
  if (!isMp4Container(meta.mimeType)) return false
  return isCompatibleCodec(meta.videoCodec)
}

export function assessTranscodeNeed(meta: TranscodeSourceMeta): TranscodeRecommendation {
  if (!isMp4Container(meta.mimeType)) return 'full'
  if (!isCompatibleCodec(meta.videoCodec)) return 'full'
  // Use short side for the resolution check — portrait videos have height > width,
  // so comparing height alone would wrongly flag a 1080×1920 portrait as 4K.
  if (Math.min(meta.width, meta.height) > PRIMARY_TARGET_HEIGHT) return 'full'
  if (meta.bitrateMbps > BITRATE_CUTOFF_MBPS) return 'bitrate'
  return 'none'
}

export function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  targetHeight: number
): { width: number; height: number } {
  const isPortrait = srcHeight > srcWidth
  const shortSide = isPortrait ? srcWidth : srcHeight
  const longSide = isPortrait ? srcHeight : srcWidth
  const clampedShort = Math.min(targetHeight, shortSide)
  const scale = clampedShort / shortSide
  const scaledLong = Math.round(longSide * scale)
  const even = (n: number) => (n % 2 === 0 ? n : n + 1)

  const finalShort = even(clampedShort)
  const finalLong = even(scaledLong)

  return isPortrait
    ? { width: finalShort, height: finalLong }
    : { width: finalLong, height: finalShort }
}

export function computeBrowserTranscodeVideoBitrate(
  width: number,
  height: number,
  qualityPreset: BrowserTranscodeQualityPreset = 'balanced',
  sourceMeta?: Pick<TranscodeSourceMeta, 'width' | 'height' | 'bitrateMbps'>
): number {
  const bpp =
    BROWSER_TRANSCODE_1080P_BITRATES[qualityPreset] /
    (TARGET_1080P_WIDTH * PRIMARY_TARGET_HEIGHT * TARGET_FPS)
  const presetBitrate = Math.round(width * height * TARGET_FPS * bpp)

  if (
    !sourceMeta ||
    sourceMeta.bitrateMbps <= 0 ||
    sourceMeta.width <= 0 ||
    sourceMeta.height <= 0
  ) {
    return presetBitrate
  }

  const sourceVideoBitrate = Math.max(
    0,
    sourceMeta.bitrateMbps * 1_000_000 - BROWSER_TRANSCODE_AUDIO_BITRATE
  )
  const sourcePixels = sourceMeta.width * sourceMeta.height
  const targetPixels = width * height
  const resolutionScale = Math.min(1, targetPixels / sourcePixels)
  const sourceGuidedBitrate = sourceVideoBitrate * resolutionScale * 0.65
  const cappedSourceGuidedBitrate = Math.min(
    sourceGuidedBitrate,
    presetBitrate * SOURCE_AWARE_MAX_MULTIPLIERS[qualityPreset]
  )

  return Math.round(Math.max(presetBitrate, cappedSourceGuidedBitrate))
}

/** A resolution option the user can select in the transcode UI. */
export interface ResolutionOption {
  height: number
  /** Suggested codec for MP4 output. */
  suggestedCodec: 'hevc' | 'avc'
}

const RESOLUTION_STEPS = [240, 360, 480, 720, 1080, 1440, 2160]

/** All standard resolutions that are ≤ the source short-side. */
export function availableResolutions(
  meta: TranscodeSourceMeta,
  supportedCodecs: string[]
): ResolutionOption[] {
  const supportsHevc = supportedCodecs.includes('hevc')
  const shortSide = Math.min(meta.width, meta.height)
  return RESOLUTION_STEPS.filter(h => h <= shortSide).map(h => ({
    height: h,
    suggestedCodec: supportsHevc ? 'hevc' : 'avc',
  }))
}

/** Apply MP4 codec policy: use HEVC when available, except for the lowest selected resolution. */
export function assignMp4ResolutionCodecs(
  resolutions: ResolutionOption[],
  supportsHevc: boolean
): ResolutionOption[] {
  if (!supportsHevc || resolutions.length === 0) {
    return resolutions.map(r => ({ ...r, suggestedCodec: 'avc' }))
  }

  const lowestHeight = Math.min(...resolutions.map(r => r.height))
  return resolutions.map(r => ({
    ...r,
    suggestedCodec: r.height === lowestHeight ? 'avc' : 'hevc',
  }))
}

/** Default-selected resolutions (primary + 480p fallback). */
export function defaultResolutions(
  meta: TranscodeSourceMeta,
  supportedCodecs: string[]
): ResolutionOption[] {
  const all = availableResolutions(meta, supportedCodecs)
  if (all.length === 0) return []
  const shortSide = Math.min(meta.width, meta.height)
  const recommendation = assessTranscodeNeed(meta)

  if (recommendation === 'none') {
    if (shortSide <= FALLBACK_TARGET_HEIGHT) return []
    const fallback = all.find(r => r.height === FALLBACK_TARGET_HEIGHT)
    return fallback ? [fallback] : []
  }

  const primaryHeight = Math.min(PRIMARY_TARGET_HEIGHT, shortSide)
  const primary = all.find(r => r.height === primaryHeight) ?? all[all.length - 1]
  const selected = [primary]
  if (shortSide > FALLBACK_TARGET_HEIGHT) {
    const fallback = all.find(r => r.height === FALLBACK_TARGET_HEIGHT)
    if (fallback && fallback.height !== primary.height) selected.push(fallback)
  }
  return selected
}

/**
 * Build the `BrowserTranscodeVariant[]` array from user selections.
 *
 * - HLS: all selected resolutions become adaptive variants in one stream (AVC only).
 * - MP4: each resolution becomes a separate file using the given codec.
 */
export function buildVariants(
  resolutions: ResolutionOption[],
  format: 'mp4' | 'hls',
  mp4Codec?: 'hevc' | 'avc',
  qualityPreset: BrowserTranscodeQualityPreset = 'balanced'
): BrowserTranscodeVariant[] {
  if (format === 'hls') {
    return resolutions.map(r => ({
      codec: r.suggestedCodec,
      targetHeight: r.height,
      format: 'hls' as const,
      label: `${r.height}p`,
      qualityPreset,
    }))
  }
  return resolutions.map(r => {
    const codec = mp4Codec ?? r.suggestedCodec
    return {
      codec,
      targetHeight: r.height,
      format: 'mp4' as const,
      label: `${r.height}p ${codec === 'hevc' ? 'HEVC' : 'H.264'}`,
      qualityPreset,
    }
  })
}

/** @deprecated Use availableResolutions + buildVariants instead. */
export function defaultVariants(
  meta: TranscodeSourceMeta,
  supportedCodecs: string[]
): BrowserTranscodeVariant[] {
  const supportsHevc = supportedCodecs.includes('hevc')
  return buildVariants(
    assignMp4ResolutionCodecs(defaultResolutions(meta, supportedCodecs), supportsHevc),
    'mp4'
  )
}

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
}

export async function transcodeFile(
  file: File,
  variant: BrowserTranscodeVariant,
  sourceMeta: TranscodeSourceMeta,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<File> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } =
    await import('mediabunny')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const { width: targetWidth, height: targetHeight } = computeTargetDimensions(
    sourceMeta.width,
    sourceMeta.height,
    variant.targetHeight
  )
  const targetBitrate = computeBrowserTranscodeVideoBitrate(
    targetWidth,
    targetHeight,
    variant.qualityPreset,
    sourceMeta
  )

  const createConversion = async (hardwareAcceleration: 'prefer-hardware' | 'no-preference') => {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat(), target })
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        width: targetWidth,
        height: targetHeight,
        fit: 'contain',
        bitrate: targetBitrate,
        codec: variant.codec as VideoCodec,
        hardwareAcceleration,
        keyFrameInterval: 2,
        forceTranscode: true,
      },
      audio: { bitrate: BROWSER_TRANSCODE_AUDIO_BITRATE },
      tags: {},
    })

    return { conversion, target }
  }

  let { conversion, target } = await createConversion('prefer-hardware')
  if (!conversion.isValid) {
    ;({ conversion, target } = await createConversion('no-preference'))
  }

  if (!conversion.isValid) {
    throw new Error(
      `Cannot encode ${variant.codec.toUpperCase()} at ${targetWidth}x${targetHeight} in this browser.`
    )
  }

  const abortConversion = () => {
    void conversion.cancel()
  }
  signal.addEventListener('abort', abortConversion, { once: true })

  try {
    conversion.onProgress = progress => {
      if (!signal.aborted) onProgress(progress)
    }

    await conversion.execute()
  } finally {
    signal.removeEventListener('abort', abortConversion)
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!target.buffer) throw new Error('Transcode produced no output')

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([target.buffer], `${baseName}_${variant.targetHeight}p_${variant.codec}.mp4`, {
    type: 'video/mp4',
    lastModified: Date.now(),
  })
}

export async function transcodeToHls(
  file: File,
  variants: BrowserTranscodeVariant[],
  sourceMeta: TranscodeSourceMeta,
  onProgress: (variantIndex: number, progress: number) => void,
  signal: AbortSignal
): Promise<Map<string, File>> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const {
    Input,
    Output,
    Conversion,
    ALL_FORMATS,
    BlobSource,
    HlsOutputFormat,
    CmafOutputFormat,
    BufferTarget,
    PathedTarget,
  } = await import('mediabunny')

  const outputFiles = new Map<string, File>()

  const output = new Output({
    format: new HlsOutputFormat({
      segmentFormat: new CmafOutputFormat(),
      targetDuration: HLS_TARGET_DURATION,
      getPlaylistPath: info => `variant-${info.n - 1}.m3u8`,
      getSegmentPath: info => `variant-${info.playlist.n - 1}/segment-${info.n - 1}.m4s`,
      getInitPath: info => `variant-${info.n - 1}/init.mp4`,
    }),
    target: new PathedTarget(
      'master.m3u8',
      ({ path, mimeType }) =>
        new BufferTarget({
          onFinalize: buffer => {
            outputFiles.set(path, new File([buffer], path, { type: mimeType }))
          },
        })
    ),
  })

  const conversion = await Conversion.init({
    input: new Input({ formats: ALL_FORMATS, source: new BlobSource(file) }),
    output,
    tracks: 'primary',
    video: variants.map(v => {
      if (v.passthrough) return {}

      const { width, height } = computeTargetDimensions(
        sourceMeta.width,
        sourceMeta.height,
        v.targetHeight
      )
      const bitrate = computeBrowserTranscodeVideoBitrate(
        width,
        height,
        v.qualityPreset,
        sourceMeta
      )
      return {
        width,
        height,
        fit: 'contain',
        bitrate,
        codec: v.codec as VideoCodec,
        keyFrameInterval: HLS_TARGET_DURATION,
        forceTranscode: true,
      }
    }),
    audio: { bitrate: BROWSER_TRANSCODE_AUDIO_BITRATE },
  })

  if (!conversion.isValid) throw new Error('HLS conversion not valid')
  console.log('[transcodeToHls] Starting conversion...')

  const abortConversion = () => {
    void conversion.cancel()
  }
  signal.addEventListener('abort', abortConversion, { once: true })

  try {
    conversion.onProgress = progress => {
      if (!signal.aborted) onProgress(0, progress)
    }

    await conversion.execute()
    console.log('[transcodeToHls] Conversion finished')
  } finally {
    signal.removeEventListener('abort', abortConversion)
  }

  return outputFiles
}

/**
 * Rewrites HLS playlists to use absolute Blossom URLs instead of relative paths.
 *
 * Handles both full paths (e.g. "variant-0/segment-0.m4s") and relative paths
 * (e.g. "segment-0.m4s" inside "variant-0.m3u8"), since mediabunny may emit
 * either depending on the output configuration.
 *
 * @param outputFiles The map of generated HLS files (path -> File)
 * @param uploadedUrls A map of original paths to their uploaded Blossom URLs
 */
export async function rewriteHlsPlaylists(
  outputFiles: Map<string, File>,
  uploadedUrls: Map<string, string>
): Promise<Map<string, File>> {
  const rewrittenFiles = new Map<string, File>()

  for (const [path, file] of outputFiles.entries()) {
    if (path.endsWith('.m3u8')) {
      let content = await file.text()

      if (import.meta.env.DEV) {
        console.log(`[rewriteHlsPlaylists] ${path} original content:\n${content}`)
      }

      // "Companion directory" for a playlist like "variant-0.m3u8" is "variant-0/".
      // mediabunny may write segment references as relative paths (e.g. "segment-0.m4s")
      // inside the variant playlist instead of the full "variant-0/segment-0.m4s".
      const companionDir = path.replace(/\.m3u8$/, '/')

      // Sort keys by length descending to avoid partial replacements
      const sortedPaths = Array.from(uploadedUrls.keys()).sort((a, b) => b.length - a.length)

      for (const originalPath of sortedPaths) {
        const absoluteUrl = uploadedUrls.get(originalPath)!
        // Use only the SHA256 hash (last URL path segment) as a relative filename.
        // Blossom URLs are https://server/<sha256>, so the hash is the last segment.
        // HLS players resolve relative references against the playlist's base URL,
        // so "abc123..." in a playlist at https://server/<hash> → https://server/abc123...
        const relativeRef = absoluteUrl.split('/').pop()!

        if (content.includes(originalPath)) {
          // Full path found in content — replace directly.
          content = content.split(originalPath).join(relativeRef)
        } else if (companionDir && originalPath.startsWith(companionDir)) {
          // Relative path: strip the companion directory prefix and try again.
          // e.g. "variant-0/segment-0.m4s" → "segment-0.m4s" inside "variant-0.m3u8"
          const relativePart = originalPath.slice(companionDir.length)
          if (relativePart && content.includes(relativePart)) {
            content = content.split(relativePart).join(relativeRef)
          }
        }
      }

      if (import.meta.env.DEV) {
        console.log(`[rewriteHlsPlaylists] ${path} rewritten content:\n${content}`)
      }

      rewrittenFiles.set(path, new File([content], path, { type: file.type }))
    } else {
      rewrittenFiles.set(path, file)
    }
  }

  return rewrittenFiles
}

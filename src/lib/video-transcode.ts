import { getCodecsFromFile } from './codec-detection'
import type { VideoCodec } from 'mediabunny'

export const BITRATE_CUTOFF_MBPS = 15
export const PRIMARY_TARGET_HEIGHT = 1080
export const FALLBACK_TARGET_HEIGHT = 480
export const BPP_MEDIUM = 0.22

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
  format: 'mp4'
  label: string
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

export function defaultVariants(
  meta: TranscodeSourceMeta,
  supportedCodecs: string[]
): BrowserTranscodeVariant[] {
  const recommendation = assessTranscodeNeed(meta)
  const supportsHevc = supportedCodecs.includes('hevc')
  const variants: BrowserTranscodeVariant[] = []
  const shortSide = Math.min(meta.width, meta.height)

  if (recommendation !== 'none') {
    const primaryHeight = Math.min(PRIMARY_TARGET_HEIGHT, shortSide)
    const primaryCodec: 'hevc' | 'avc' = supportsHevc ? 'hevc' : 'avc'

    variants.push({
      codec: primaryCodec,
      targetHeight: primaryHeight,
      format: 'mp4',
      label: `${primaryHeight}p ${primaryCodec === 'hevc' ? 'HEVC' : 'H.264'}`,
    })
  }

  if (shortSide > FALLBACK_TARGET_HEIGHT) {
    variants.push({
      codec: 'avc',
      targetHeight: FALLBACK_TARGET_HEIGHT,
      format: 'mp4',
      label: `${FALLBACK_TARGET_HEIGHT}p H.264`,
    })
  }

  return variants
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

  const {
    Input,
    Output,
    Conversion,
    ALL_FORMATS,
    BlobSource,
    Mp4OutputFormat,
    BufferTarget,
    QUALITY_MEDIUM,
  } = await import('mediabunny')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const { width: targetWidth, height: targetHeight } = computeTargetDimensions(
    sourceMeta.width,
    sourceMeta.height,
    variant.targetHeight
  )
  const targetBitrate = Math.round(targetWidth * targetHeight * 30 * BPP_MEDIUM)

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
      audio: { bitrate: QUALITY_MEDIUM },
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

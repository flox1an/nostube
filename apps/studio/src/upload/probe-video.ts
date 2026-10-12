import {
  estimateMp4ConversionMemoryBytes,
  probeMp4Conversion,
  type TranscodeSourceMeta,
} from '@nostube/core/video-transcode'
import i18n from '../i18n'

/** What the page learns from a video file before it is uploaded. */
export interface VideoProbe {
  width: number
  height: number
  duration: number
  /** A still from the video, JPEG. */
  thumbnail: Blob
}

/** Published as they are when this browser plays them; anything else is converted to MP4 first. */
export const SUPPORTED_TYPES = ['video/mp4', 'video/webm']

/** What the file picker offers: any video, plus extensions some systems give no video type. */
export const VIDEO_ACCEPT = { 'video/*': ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi'] }

const THUMBNAIL_WIDTH = 640
const STEP_TIMEOUT_MS = 20_000

/** When to take the still: a second in, or a tenth of a short clip, never at the very start. */
export function thumbnailTime(duration: number): number {
  return Math.max(0, Math.min(1, duration * 0.1))
}

/** `width x height` scaled down to at most `maxWidth` wide, keeping the shape. */
export function fitWithin(width: number, height: number, maxWidth: number): [number, number] {
  if (width <= maxWidth) return [width, height]
  return [maxWidth, Math.max(1, Math.round((height * maxWidth) / width))]
}

function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(i18n.t('studio.errors.loadTimeout'))),
      STEP_TIMEOUT_MS
    )
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
    target.addEventListener(
      'error',
      () => {
        clearTimeout(timer)
        reject(new Error(i18n.t('studio.errors.cannotPlay')))
      },
      { once: true }
    )
  })
}

/**
 * Reads size and length from the file and takes a still. Getting the still is also the proof that
 * the browser can really decode the video: a format it cannot play fails here, with a clear
 * message, and not after a long upload.
 */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    const loaded = once(video, 'loadedmetadata')
    video.src = url
    await loaded
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      throw new Error(i18n.t('studio.errors.cannotPlay'))
    }
    const { videoWidth: width, videoHeight: height, duration } = video
    const seeked = once(video, 'seeked')
    video.currentTime = thumbnailTime(duration)
    await seeked
    const [w, h] = fitWithin(width, height, THUMBNAIL_WIDTH)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
    const thumbnail = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error(i18n.t('studio.errors.noStill')))),
        'image/jpeg',
        0.85
      )
    )
    return { width, height, duration, thumbnail }
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

/** A chosen file: published as it is (`probe`), or converted to MP4 first (`convert`). */
export type ChosenVideo =
  { probe: VideoProbe; convert?: undefined } | { probe?: undefined; convert: TranscodeSourceMeta }

/**
 * Decides how a chosen file is published. MP4 and WebM this browser plays go as they are; other
 * containers (MOV, MKV, AVI) and codecs it cannot play (HEVC on some systems) are converted, which
 * is checked here so that a browser that cannot convert says so before the upload.
 */
export async function inspectVideo(file: File): Promise<ChosenVideo> {
  if (SUPPORTED_TYPES.includes(file.type)) {
    try {
      return { probe: await probeVideo(file) }
    } catch {
      // Not playable here: converting may still work.
    }
  }
  const convert = await probeMp4Conversion(file).catch((error: unknown) => {
    // The message is an Mp4ConversionProblem; anything else (a chunk that failed to load) as it is.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(i18n.t(`studio.errors.${message}`, { defaultValue: message }))
  })
  return { convert }
}

/** From here on a conversion warns about the memory it needs (the tab may crash before). */
const CONVERT_MEMORY_WARNING_BYTES = 2e9

/** "Converted to MP4 …", and for a long video how much memory the conversion needs. */
export function convertHint(meta: TranscodeSourceMeta): string {
  const hint = i18n.t('studio.upload.willConvert')
  const memory = estimateMp4ConversionMemoryBytes(meta)
  if (memory < CONVERT_MEMORY_WARNING_BYTES) return hint
  const gb = (memory / 1e9).toLocaleString(i18n.language, { maximumFractionDigits: 1 })
  return `${hint} · ${i18n.t('studio.upload.convertMemory', { gb })}`
}

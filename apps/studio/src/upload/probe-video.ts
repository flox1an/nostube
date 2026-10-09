import i18n from '../i18n'

/** What the page learns from a video file before it is uploaded. */
export interface VideoProbe {
  width: number
  height: number
  duration: number
  /** A still from the video, JPEG. */
  thumbnail: Blob
}

/** Which formats the first version publishes: the ones every browser plays without conversion. */
export const SUPPORTED_TYPES = ['video/mp4', 'video/webm']

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
  if (!SUPPORTED_TYPES.includes(file.type)) {
    throw new Error(
      file.type
        ? i18n.t('studio.errors.unsupportedType', { type: file.type })
        : i18n.t('studio.errors.unknownType')
    )
  }
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

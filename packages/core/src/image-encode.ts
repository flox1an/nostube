/**
 * Encoding of images made in a canvas (video stills, cropped branding): WebP where the browser can
 * encode it, a fallback format otherwise. Safari's canvas cannot encode WebP; `toBlob('image/webp')`
 * silently returns a PNG there, so the type of the result is checked, not trusted.
 */

/** Quality of generated video thumbnails. */
const THUMBNAIL_QUALITY = 0.75

type Encodable = Pick<HTMLCanvasElement, 'toBlob'>

function toBlob(canvas: Encodable, type: string, quality: number): Promise<Blob | null> {
  // Executor form on purpose: core compiles under each consumer's ES2020 lib, where
  // Promise.withResolvers is not typed (only apps/web declares it in its global.d.ts).
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * The canvas as WebP, or as `fallback` where the browser cannot encode WebP; null when the canvas
 * cannot encode at all. Use `image/png` as the fallback for images that may be transparent (JPEG
 * has no alpha channel: transparent pixels would turn black).
 */
export async function encodeImage(
  canvas: Encodable,
  quality: number,
  fallback: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<Blob | null> {
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp?.type === 'image/webp') return webp
  const other = await toBlob(canvas, fallback, quality)
  return other?.type === fallback ? other : null
}

/** A video still for publishing: WebP, or JPEG where the browser cannot encode WebP. */
export function encodeThumbnail(canvas: Encodable): Promise<Blob | null> {
  return encodeImage(canvas, THUMBNAIL_QUALITY)
}

/** `<base>.<ext>` with the extension of the blob's actual type (`jpg` for JPEG). */
export function imageFileName(base: string, blob: Blob): string {
  const subtype = blob.type.split('/')[1] || 'webp'
  return `${base}.${subtype === 'jpeg' ? 'jpg' : subtype}`
}

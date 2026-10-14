import { describe, it, expect } from 'vitest'
import { encodeImage, encodeThumbnail, imageFileName } from './image-encode'

/** A canvas stand-in whose encoder answers `types[requested]` (the type the browser really produces). */
function canvas(types: Record<string, string | null>) {
  const requested: Array<[string, number | undefined]> = []
  return {
    requested,
    toBlob(callback: BlobCallback, type?: string, quality?: number) {
      requested.push([type ?? '', quality])
      const actual = types[type ?? '']
      callback(actual ? new Blob(['x'], { type: actual }) : null)
    },
  }
}

const SAFARI = { 'image/webp': 'image/png', 'image/jpeg': 'image/jpeg', 'image/png': 'image/png' }

describe('encodeThumbnail', () => {
  it('returns WebP where the browser encodes it', async () => {
    const c = canvas({ 'image/webp': 'image/webp' })
    expect((await encodeThumbnail(c))?.type).toBe('image/webp')
    expect(c.requested).toEqual([['image/webp', 0.75]])
  })

  it('falls back to JPEG when WebP comes back as PNG (Safari)', async () => {
    const c = canvas(SAFARI)
    expect((await encodeThumbnail(c))?.type).toBe('image/jpeg')
    expect(c.requested.map(([type]) => type)).toEqual(['image/webp', 'image/jpeg'])
  })

  it('returns null when the canvas cannot encode either format', async () => {
    expect(await encodeThumbnail(canvas({ 'image/webp': null, 'image/jpeg': null }))).toBeNull()
    expect(
      await encodeThumbnail(canvas({ 'image/webp': 'image/png', 'image/jpeg': 'image/png' }))
    ).toBeNull()
  })
})

describe('encodeImage', () => {
  it('keeps transparency on Safari with a PNG fallback, at the requested quality', async () => {
    const c = canvas(SAFARI)
    expect((await encodeImage(c, 0.7, 'image/png'))?.type).toBe('image/png')
    expect(c.requested).toEqual([
      ['image/webp', 0.7],
      ['image/png', 0.7],
    ])
  })
})

describe('imageFileName', () => {
  it('names the file after its actual type', () => {
    expect(imageFileName('thumbnail', new Blob([], { type: 'image/webp' }))).toBe('thumbnail.webp')
    expect(imageFileName('thumbnail', new Blob([], { type: 'image/jpeg' }))).toBe('thumbnail.jpg')
    expect(imageFileName('logo', new Blob([], { type: 'image/png' }))).toBe('logo.png')
  })
})

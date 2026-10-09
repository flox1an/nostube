import { describe, expect, it } from 'vitest'
import { blossomAuthorization, buildUploadAuth, uploadAuthTtl } from './blossom-auth'

const HASH = 'a'.repeat(64)

describe('buildUploadAuth', () => {
  const event = buildUploadAuth({ sha256: HASH, fileName: 'clip.mp4', now: 1_000_000 })

  it('asks for an upload of exactly this blob', () => {
    expect(event.kind).toBe(24242)
    expect(event.tags).toContainEqual(['t', 'upload'])
    expect(event.tags).toContainEqual(['x', HASH])
  })

  it('expires in the future, within the server limit, and is never dated ahead', () => {
    const expiration = Number(event.tags.find(t => t[0] === 'expiration')![1])
    expect(expiration).toBeGreaterThan(1_000_000)
    expect(expiration - event.created_at).toBeLessThanOrEqual(24 * 3600)
    expect(event.created_at).toBeLessThan(1_000_000)
  })
})

describe('blossomAuthorization', () => {
  it('is Nostr plus base64 of the event, also for a file name with non-ASCII letters', () => {
    const signed = { id: 'x', content: 'Upload Größe-日本.mp4' }
    const header = blossomAuthorization(signed)
    expect(header.startsWith('Nostr ')).toBe(true)
    const bytes = Uint8Array.from(atob(header.slice(6)), c => c.charCodeAt(0))
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(signed)
  })
})

describe('uploadAuthTtl', () => {
  it('is an hour for a small file and grows with the size up to the server limit', () => {
    expect(uploadAuthTtl(5 * 1024 * 1024)).toBe(3600)
    expect(uploadAuthTtl(2 * 1024 ** 3)).toBe(Math.ceil((2 * 1024 ** 3) / (256 * 1024)))
    expect(uploadAuthTtl(2 * 1024 ** 3)).toBeGreaterThan(3600)
    expect(uploadAuthTtl(4 * 1024 ** 3)).toBeLessThanOrEqual(24 * 3600)
    expect(uploadAuthTtl(100 * 1024 ** 3)).toBe(24 * 3600)
  })
})

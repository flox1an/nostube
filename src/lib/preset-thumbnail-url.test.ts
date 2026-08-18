import { describe, expect, it } from 'vitest'
import { presetThumbnailUrl, insecureThumbnailUrl } from './preset-thumbnail-url'

const BASE_URL = 'https://img.example'
const HASH = 'a'.repeat(64)

describe('presetThumbnailUrl', () => {
  it('builds the fixed preset URL with an optional source extension', () => {
    expect(presetThumbnailUrl(`${BASE_URL}/`, 'feed-preview-v1', HASH, { extension: 'mp4' })).toBe(
      `${BASE_URL}/v1/preset/feed-preview-v1/${HASH}.mp4`
    )
  })

  it('builds an extensionless URL without query parameters', () => {
    expect(presetThumbnailUrl(BASE_URL, 'profile-avatar-v1', HASH)).toBe(
      `${BASE_URL}/v1/preset/profile-avatar-v1/${HASH}`
    )
  })

  it('appends a known Blossom server as a repeatable xs hint', () => {
    expect(
      presetThumbnailUrl(BASE_URL, 'feed-preview-v1', HASH, {
        serverHints: ['https://cdn.example.com'],
      })
    ).toBe(`${BASE_URL}/v1/preset/feed-preview-v1/${HASH}?xs=https%3A%2F%2Fcdn.example.com`)
  })

  it('appends multiple server hints, deduplicated and capped at four', () => {
    const result = presetThumbnailUrl(BASE_URL, 'feed-preview-v1', HASH, {
      serverHints: ['a.example', 'b.example', 'a.example', 'c.example', 'd.example', 'e.example'],
    })
    const url = new URL(result)
    expect(url.searchParams.getAll('xs')).toEqual([
      'a.example',
      'b.example',
      'c.example',
      'd.example',
    ])
  })

  it('drops null/undefined server hints', () => {
    const result = presetThumbnailUrl(BASE_URL, 'feed-preview-v1', HASH, {
      serverHints: [undefined, null, 'cdn.example.com'],
    })
    expect(new URL(result).searchParams.getAll('xs')).toEqual(['cdn.example.com'])
  })

  it('appends the author pubkey as `as`', () => {
    const result = presetThumbnailUrl(BASE_URL, 'profile-avatar-v1', HASH, {
      authorPubkey: 'deadbeef',
    })
    expect(new URL(result).searchParams.get('as')).toBe('deadbeef')
  })

  it('combines server hints and author pubkey in one URL', () => {
    const result = presetThumbnailUrl(BASE_URL, 'embed-card-v1', HASH, {
      extension: 'jpg',
      serverHints: ['cdn.example.com'],
      authorPubkey: 'deadbeef',
    })
    const url = new URL(result)
    expect(url.pathname).toBe(`/v1/preset/embed-card-v1/${HASH}.jpg`)
    expect(url.searchParams.getAll('xs')).toEqual(['cdn.example.com'])
    expect(url.searchParams.get('as')).toBe('deadbeef')
  })
})

describe('insecureThumbnailUrl', () => {
  it('mirrors the fit-preset directives for a non-Blossom source URL', () => {
    const result = insecureThumbnailUrl(
      BASE_URL,
      'feed-preview-v1',
      'https://cdn.example.com/photo.jpg'
    )
    expect(result).toBe(
      `${BASE_URL}/insecure/f:webp/q:82/rs:fit:480:480/plain/https%3A%2F%2Fcdn.example.com%2Fphoto.jpg`
    )
  })

  it('mirrors the fill-preset directives for an avatar source URL', () => {
    const result = insecureThumbnailUrl(
      BASE_URL,
      'profile-avatar-v1',
      'https://cdn.example.com/pic.png'
    )
    expect(result).toContain('/insecure/f:webp/q:85/rs:fill:160:160/plain/')
  })

  it('mirrors the embed-card directives', () => {
    const result = insecureThumbnailUrl(BASE_URL, 'embed-card-v1', 'https://cdn.example.com/x.jpg')
    expect(result).toContain('/insecure/f:webp/q:82/rs:fit:1200:630/plain/')
  })

  it('percent-encodes the source URL as a single path segment', () => {
    const result = insecureThumbnailUrl(
      BASE_URL,
      'feed-preview-v1',
      'https://cdn.example.com/a b?c=d&e=f'
    )
    const encoded = result.split('/plain/')[1]
    expect(decodeURIComponent(encoded)).toBe('https://cdn.example.com/a b?c=d&e=f')
    expect(encoded).not.toContain('/')
  })
})

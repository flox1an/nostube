import { describe, expect, it } from 'vitest'
import { presetThumbnailUrl } from './preset-thumbnail-url'

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

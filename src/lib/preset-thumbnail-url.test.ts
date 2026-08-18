import { describe, expect, it } from 'vitest'
import { presetThumbnailUrl } from './preset-thumbnail-url'

const BASE_URL = 'https://img.example'
const HASH = 'a'.repeat(64)

describe('presetThumbnailUrl', () => {
  it('builds the fixed preset URL with an optional source extension', () => {
    expect(presetThumbnailUrl(`${BASE_URL}/`, 'feed-preview-v1', HASH, 'mp4')).toBe(
      `${BASE_URL}/v1/preset/feed-preview-v1/${HASH}.mp4`
    )
  })

  it('builds an extensionless URL without query parameters', () => {
    expect(presetThumbnailUrl(BASE_URL, 'profile-avatar-v1', HASH)).toBe(
      `${BASE_URL}/v1/preset/profile-avatar-v1/${HASH}`
    )
  })
})

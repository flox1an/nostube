import { describe, expect, it } from 'vitest'
import { DEFAULT_IMGPROXY_BASE_URL, getImgproxyBaseUrl } from './imgproxy-config'

describe('getImgproxyBaseUrl', () => {
  it('uses the browser-local override after normalizing trailing slashes', () => {
    expect(getImgproxyBaseUrl(' http://localhost:8081/ ')).toBe('http://localhost:8081')
  })

  it('uses Nostube’s built-in endpoint when no personal override is configured', () => {
    expect(getImgproxyBaseUrl()).toBe(DEFAULT_IMGPROXY_BASE_URL)
    expect(getImgproxyBaseUrl('  ')).toBe(DEFAULT_IMGPROXY_BASE_URL)
  })
})

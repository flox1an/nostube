import { describe, expect, it } from 'vitest'
import {
  classifyMediaUrl,
  isAllowedConfiguredServiceUrl,
  isAllowedEventMediaUrl,
} from './media-url-policy'

describe('media URL policy', () => {
  it.each([
    'http://localhost:3000/video.mp4',
    'http://127.0.0.1/video.mp4',
    'http://10.0.0.1/video.mp4',
    'http://172.16.1.1/video.mp4',
    'http://192.168.1.1/video.mp4',
    'http://169.254.1.1/video.mp4',
    'http://[::1]/video.mp4',
    'http://[fd00::1]/video.mp4',
  ])('rejects private event URL %s', url => {
    expect(isAllowedEventMediaUrl(url)).toBe(false)
  })

  it('allows public event URLs but keeps local configured services usable', () => {
    expect(isAllowedEventMediaUrl('https://cdn.example.com/video.mp4')).toBe(true)
    expect(isAllowedConfiguredServiceUrl('http://127.0.0.1:24242')).toBe(true)
    expect(classifyMediaUrl('http://127.0.0.1:24242', 'event')).toBe('blocked-loopback')
  })
})

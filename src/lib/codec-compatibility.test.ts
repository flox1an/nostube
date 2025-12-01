import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isIOSDevice,
  isSafari,
  isCodecSupported,
  filterCompatibleVariants,
  getPreferredCodecOrder,
} from './codec-compatibility'

// Mock navigator
const mockNavigator = (userAgent: string, platform: string, maxTouchPoints: number) => {
  Object.defineProperty(global.navigator, 'userAgent', {
    value: userAgent,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(global.navigator, 'platform', {
    value: platform,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(global.navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    writable: true,
    configurable: true,
  })
}

// Mock document.createElement for canPlayType
const mockCanPlayType = (supportMap: Record<string, string>) => {
  const createElement = vi.spyOn(document, 'createElement')
  createElement.mockReturnValue({
    canPlayType: (mimeType: string) => supportMap[mimeType] || '',
  } as any)
  return createElement
}

describe('codec-compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('isIOSDevice', () => {
    it('should detect iPhone', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)
      expect(isIOSDevice()).toBe(true)
    })

    it('should detect iPad', () => {
      mockNavigator('Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)', 'iPad', 0)
      expect(isIOSDevice()).toBe(true)
    })

    it('should detect iPad on iOS 13+ (desktop mode)', () => {
      mockNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5)
      expect(isIOSDevice()).toBe(true)
    })

    it('should not detect macOS as iOS', () => {
      mockNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 0)
      expect(isIOSDevice()).toBe(false)
    })

    it('should not detect Android as iOS', () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 11)', 'Linux', 0)
      expect(isIOSDevice()).toBe(false)
    })
  })

  describe('isSafari', () => {
    it('should detect Safari on macOS', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
        'MacIntel',
        0
      )
      expect(isSafari()).toBe(true)
    })

    it('should detect Safari on iOS', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        'iPhone',
        0
      )
      expect(isSafari()).toBe(true)
    })

    it('should not detect Chrome as Safari', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'MacIntel',
        0
      )
      expect(isSafari()).toBe(false)
    })
  })

  describe('isCodecSupported', () => {
    it('should return true for undefined mimeType', () => {
      expect(isCodecSupported(undefined)).toBe(true)
    })

    it('should allow hvc1 but not hevc on iOS', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)
      const createElement = mockCanPlayType({
        'video/mp4; codecs=hvc1': 'probably',
      })

      // hvc1 (MP4 codec ID) is supported
      expect(isCodecSupported('video/mp4; codecs=hvc1')).toBe(true)

      // Generic names are not supported
      expect(isCodecSupported('video/mp4; codecs=hevc')).toBe(false)
      expect(isCodecSupported('video/mp4; codecs=h265')).toBe(false)

      createElement.mockRestore()
    })

    it('should filter VP9 on iOS', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)
      expect(isCodecSupported('video/webm; codecs=vp9')).toBe(false)
    })

    it('should filter AV1 on iOS', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)
      expect(isCodecSupported('video/mp4; codecs=av01')).toBe(false)
      expect(isCodecSupported('video/mp4; codecs=av1')).toBe(false)
    })

    it('should allow H.264 on iOS', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)
      const createElement = mockCanPlayType({
        'video/mp4; codecs=avc1': 'probably',
      })

      expect(isCodecSupported('video/mp4; codecs=avc1')).toBe(true)
      createElement.mockRestore()
    })

    it('should use canPlayType when available', () => {
      mockNavigator('Chrome', 'Win32', 0)

      const createElement = mockCanPlayType({
        'video/mp4; codecs=avc1': 'probably',
        'video/webm; codecs=vp9': 'maybe',
        'video/avi': '',
      })

      expect(isCodecSupported('video/mp4; codecs=avc1')).toBe(true)
      expect(isCodecSupported('video/webm; codecs=vp9')).toBe(true)
      expect(isCodecSupported('video/avi')).toBe(false)

      createElement.mockRestore()
    })
  })

  describe('filterCompatibleVariants', () => {
    const createVariant = (mimeType: string, quality: string) => ({
      url: `https://example.com/${quality}.mp4`,
      mimeType,
      quality,
    })

    it('should keep HEVC variants on iOS', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)

      const createElement = mockCanPlayType({
        'video/mp4; codecs=hvc1': 'probably',
        'video/mp4; codecs=avc1': 'probably',
      })

      const variants = [
        createVariant('video/mp4; codecs=hvc1', '1080p'),
        createVariant('video/mp4; codecs=avc1', '720p'),
        createVariant('video/mp4; codecs=avc1', '480p'),
      ]

      const filtered = filterCompatibleVariants(variants)

      expect(filtered).toHaveLength(3)
      expect(filtered[0].quality).toBe('1080p')
      expect(filtered[1].quality).toBe('720p')
      expect(filtered[2].quality).toBe('480p')

      createElement.mockRestore()
    })

    it('should keep all variants on desktop Chrome', () => {
      mockNavigator('Chrome', 'Win32', 0)

      const createElement = mockCanPlayType({
        'video/mp4; codecs=hvc1': 'probably',
        'video/mp4; codecs=avc1': 'probably',
      })

      const variants = [
        createVariant('video/mp4; codecs=hvc1', '1080p'),
        createVariant('video/mp4; codecs=avc1', '720p'),
      ]

      const filtered = filterCompatibleVariants(variants)

      expect(filtered).toHaveLength(2)

      createElement.mockRestore()
    })

    it('should return original array if all filtered', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)

      const variants = [
        createVariant('video/webm; codecs=vp9', '1080p'),
        createVariant('video/mp4; codecs=av01', '720p'),
      ]

      const filtered = filterCompatibleVariants(variants)

      // Should return original to avoid showing nothing
      expect(filtered).toHaveLength(2)
      expect(filtered).toEqual(variants)
    })

    it('should handle empty array', () => {
      const filtered = filterCompatibleVariants([])
      expect(filtered).toEqual([])
    })
  })

  describe('getPreferredCodecOrder', () => {
    it('should prefer hvc1 on iOS', () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 'iPhone', 0)

      const order = getPreferredCodecOrder()
      expect(order[0]).toBe('hvc1')
      expect(order).toContain('hev1')
      expect(order).toContain('h264')
      expect(order).toContain('avc1')
      // hvc1 should come before H.264
      expect(order.indexOf('hvc1')).toBeLessThan(order.indexOf('h264'))
      // Generic 'hevc' should NOT be in iOS order
      expect(order).not.toContain('hevc')
      expect(order).not.toContain('h265')
    })

    it('should prefer modern codecs on desktop', () => {
      mockNavigator('Chrome', 'Win32', 0)

      const order = getPreferredCodecOrder()
      expect(order[0]).toBe('av01')
      expect(order).toContain('vp9')
      expect(order).toContain('hevc')
    })
  })
})

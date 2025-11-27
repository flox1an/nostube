import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TitleOverlay } from './title-overlay.js'

describe('TitleOverlay', () => {
  let container
  let videoElement
  let mockVideoMetadata

  beforeEach(() => {
    // Create mock video element
    videoElement = document.createElement('video')

    // Mock video properties and methods (jsdom doesn't fully implement HTMLMediaElement)
    Object.defineProperty(videoElement, 'paused', {
      value: true,
      writable: true,
      configurable: true,
    })
    videoElement.pause = vi.fn()
    videoElement.play = vi.fn()

    // Create mock container
    container = document.createElement('div')
    container.className = 'nostube-player-container'

    // Mock video metadata
    mockVideoMetadata = {
      id: 'test-event-id',
      title: 'Test Video Title',
      author: 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
      authorName: 'Test Author',
      authorAvatar: 'https://example.com/avatar.jpg',
      description: 'Test description',
      videoVariants: [],
      thumbnails: [],
    }

    // Mock timers
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('createOverlay', () => {
    it('should create overlay with title and author sections', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)

      expect(overlay).toBeInstanceOf(HTMLElement)
      expect(overlay.className).toBe('title-overlay')
      expect(overlay.getAttribute('aria-hidden')).toBe('true')

      const titleSection = overlay.querySelector('.title-section')
      expect(titleSection).toBeInstanceOf(HTMLElement)

      const authorSection = overlay.querySelector('.author-section')
      expect(authorSection).toBeInstanceOf(HTMLElement)
    })

    it('should display video title', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)
      const titleEl = overlay.querySelector('.video-title')

      expect(titleEl.textContent).toBe('Test Video Title')
    })

    it('should display author name', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)
      const authorNameEl = overlay.querySelector('.author-name')

      expect(authorNameEl.textContent).toBe('Test Author')
    })

    it('should display author avatar', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)
      const avatarEl = overlay.querySelector('.author-avatar')

      expect(avatarEl.src).toBe('https://example.com/avatar.jpg')
      expect(avatarEl.alt).toBe('Test Author')
    })

    it('should use fallback title when title is missing', () => {
      const metadata = { ...mockVideoMetadata, title: undefined }
      const overlay = TitleOverlay.createOverlay(metadata)
      const titleEl = overlay.querySelector('.video-title')

      expect(titleEl.textContent).toBe('Untitled Video')
    })

    it('should use formatted pubkey when author name is missing', () => {
      const metadata = { ...mockVideoMetadata, authorName: undefined }
      const overlay = TitleOverlay.createOverlay(metadata)
      const authorNameEl = overlay.querySelector('.author-name')

      expect(authorNameEl.textContent).toBe('abcd1234...1234')
    })

    it('should use default avatar when avatar is missing', () => {
      const metadata = { ...mockVideoMetadata, authorAvatar: undefined }
      const overlay = TitleOverlay.createOverlay(metadata)
      const avatarEl = overlay.querySelector('.author-avatar')

      expect(avatarEl.src).toContain('data:image/svg+xml')
    })

    it('should truncate long titles', () => {
      const longTitle = 'A'.repeat(100)
      const metadata = { ...mockVideoMetadata, title: longTitle }
      const overlay = TitleOverlay.createOverlay(metadata)
      const titleEl = overlay.querySelector('.video-title')

      expect(titleEl.textContent.length).toBeLessThanOrEqual(73) // 70 + "..."
      expect(titleEl.textContent).toContain('...')
    })

    it('should handle avatar load errors with fallback', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)
      const avatarEl = overlay.querySelector('.author-avatar')

      // Trigger error event
      avatarEl.dispatchEvent(new Event('error'))

      expect(avatarEl.src).toContain('data:image/svg+xml')
    })
  })

  describe('applyToPlayer', () => {
    it('should not create overlay when showTitle is false', () => {
      const params = { showTitle: false }

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      expect(container.querySelector('.title-overlay')).toBeNull()
    })

    it('should create and append overlay when showTitle is true', () => {
      const params = { showTitle: true }

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')
      expect(overlay).toBeInstanceOf(HTMLElement)
    })

    it('should hide overlay after 3 seconds when playing', () => {
      const params = { showTitle: true }

      // Update paused property
      Object.defineProperty(videoElement, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      })

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')
      expect(overlay.classList.contains('hidden')).toBe(false)

      // Fast-forward 3 seconds
      vi.advanceTimersByTime(3000)

      expect(overlay.classList.contains('hidden')).toBe(true)
    })

    it('should not hide overlay after 3 seconds when paused', () => {
      const params = { showTitle: true }
      videoElement.paused = true

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')
      expect(overlay.classList.contains('hidden')).toBe(false)

      // Fast-forward 3 seconds
      vi.advanceTimersByTime(3000)

      // Should still be visible because video is paused
      expect(overlay.classList.contains('hidden')).toBe(false)
    })

    it('should show overlay on mouseenter', () => {
      const params = { showTitle: true }

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Hide overlay first
      TitleOverlay.hide(overlay)
      expect(overlay.classList.contains('hidden')).toBe(true)

      // Trigger mouseenter
      container.dispatchEvent(new Event('mouseenter'))

      expect(overlay.classList.contains('hidden')).toBe(false)
    })

    it('should hide overlay on mouseleave when playing', () => {
      const params = { showTitle: true }

      // Update paused property
      Object.defineProperty(videoElement, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      })

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Show overlay first
      TitleOverlay.show(overlay)
      expect(overlay.classList.contains('hidden')).toBe(false)

      // Trigger mouseleave
      container.dispatchEvent(new Event('mouseleave'))

      expect(overlay.classList.contains('hidden')).toBe(true)
    })

    it('should not hide overlay on mouseleave when paused', () => {
      const params = { showTitle: true }
      videoElement.paused = true

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Show overlay first
      TitleOverlay.show(overlay)
      expect(overlay.classList.contains('hidden')).toBe(false)

      // Trigger mouseleave
      container.dispatchEvent(new Event('mouseleave'))

      // Should still be visible because video is paused
      expect(overlay.classList.contains('hidden')).toBe(false)
    })

    it('should show overlay on pause event', () => {
      const params = { showTitle: true }

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Hide overlay first
      TitleOverlay.hide(overlay)
      expect(overlay.classList.contains('hidden')).toBe(true)

      // Trigger pause event
      videoElement.dispatchEvent(new Event('pause'))

      expect(overlay.classList.contains('hidden')).toBe(false)
    })

    it('should hide overlay on play event', () => {
      const params = { showTitle: true }

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Show overlay first
      TitleOverlay.show(overlay)
      expect(overlay.classList.contains('hidden')).toBe(false)

      // Trigger play event
      videoElement.dispatchEvent(new Event('play'))

      expect(overlay.classList.contains('hidden')).toBe(true)
    })

    it('should clear timer on mouseenter', () => {
      const params = { showTitle: true }

      // Update paused property
      Object.defineProperty(videoElement, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      })

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Trigger mouseenter before 3 seconds
      vi.advanceTimersByTime(2000)
      container.dispatchEvent(new Event('mouseenter'))

      // Advance past original 3 second mark
      vi.advanceTimersByTime(2000)

      // Should still be visible because timer was cleared
      expect(overlay.classList.contains('hidden')).toBe(false)
    })

    it('should clear timer on pause event', () => {
      const params = { showTitle: true }

      // Update paused property
      Object.defineProperty(videoElement, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      })

      TitleOverlay.applyToPlayer(container, videoElement, mockVideoMetadata, params)

      const overlay = container.querySelector('.title-overlay')

      // Trigger pause before 3 seconds
      vi.advanceTimersByTime(2000)
      videoElement.dispatchEvent(new Event('pause'))

      // Advance past original 3 second mark
      vi.advanceTimersByTime(2000)

      // Should still be visible because timer was cleared
      expect(overlay.classList.contains('hidden')).toBe(false)
    })
  })

  describe('show', () => {
    it('should remove hidden class', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)
      overlay.classList.add('hidden')

      TitleOverlay.show(overlay)

      expect(overlay.classList.contains('hidden')).toBe(false)
    })
  })

  describe('hide', () => {
    it('should add hidden class', () => {
      const overlay = TitleOverlay.createOverlay(mockVideoMetadata)

      TitleOverlay.hide(overlay)

      expect(overlay.classList.contains('hidden')).toBe(true)
    })
  })

  describe('truncateTitle', () => {
    it('should not truncate short titles', () => {
      const title = 'Short Title'
      expect(TitleOverlay.truncateTitle(title)).toBe('Short Title')
    })

    it('should truncate long titles', () => {
      const longTitle = 'A'.repeat(100)
      const result = TitleOverlay.truncateTitle(longTitle, 70)

      expect(result.length).toBe(73) // 70 + "..."
      expect(result.endsWith('...')).toBe(true)
    })

    it('should handle empty title', () => {
      expect(TitleOverlay.truncateTitle('')).toBe('Untitled Video')
      expect(TitleOverlay.truncateTitle(null)).toBe('Untitled Video')
      expect(TitleOverlay.truncateTitle(undefined)).toBe('Untitled Video')
    })

    it('should use custom max length', () => {
      const title = 'A'.repeat(50)
      const result = TitleOverlay.truncateTitle(title, 30)

      expect(result.length).toBe(33) // 30 + "..."
      expect(result.endsWith('...')).toBe(true)
    })
  })

  describe('formatPubkey', () => {
    it('should format valid pubkey', () => {
      const pubkey = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234'
      const result = TitleOverlay.formatPubkey(pubkey)

      expect(result).toBe('abcd1234...1234')
    })

    it('should handle short pubkey', () => {
      const pubkey = 'short'
      expect(TitleOverlay.formatPubkey(pubkey)).toBe('Anonymous')
    })

    it('should handle empty pubkey', () => {
      expect(TitleOverlay.formatPubkey('')).toBe('Anonymous')
      expect(TitleOverlay.formatPubkey(null)).toBe('Anonymous')
      expect(TitleOverlay.formatPubkey(undefined)).toBe('Anonymous')
    })
  })

  describe('getDefaultAvatar', () => {
    it('should return data URL with SVG', () => {
      const result = TitleOverlay.getDefaultAvatar()

      expect(result).toContain('data:image/svg+xml')
      // SVG is URL-encoded, so check for encoded svg tag
      expect(result).toMatch(/%3Csvg|<svg/)
    })
  })
})

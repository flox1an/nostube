import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrandingLink } from './branding.js'

describe('BrandingLink', () => {
  let container
  let videoElement

  beforeEach(() => {
    // Create container for testing
    container = document.createElement('div')
    container.className = 'nostube-player-container'
    document.body.appendChild(container)

    // Create mock video element
    videoElement = document.createElement('video')
    videoElement.className = 'nostube-video'
    container.appendChild(videoElement)

    // Mock console.log to avoid test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Clean up
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  describe('generateVideoUrl', () => {
    it('should generate correct URL for nevent identifier', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const url = BrandingLink.generateVideoUrl(videoId)

      expect(url).toBe('https://nostu.be/video/nevent1qqsxyz123abc')
    })

    it('should generate correct URL for naddr identifier', () => {
      const videoId = 'naddr1qqxyz456def'
      const url = BrandingLink.generateVideoUrl(videoId)

      expect(url).toBe('https://nostu.be/video/naddr1qqxyz456def')
    })

    it('should generate correct URL for note identifier', () => {
      const videoId = 'note1abc789xyz'
      const url = BrandingLink.generateVideoUrl(videoId)

      expect(url).toBe('https://nostu.be/video/note1abc789xyz')
    })

    it('should handle identifiers with special characters', () => {
      const videoId = 'nevent1qqsxyz_123-abc'
      const url = BrandingLink.generateVideoUrl(videoId)

      expect(url).toBe('https://nostu.be/video/nevent1qqsxyz_123-abc')
    })
  })

  describe('createLogoSvg', () => {
    it('should create SVG element with correct attributes', () => {
      const logo = BrandingLink.createLogoSvg()

      expect(logo.tagName).toBe('svg')
      expect(logo.getAttribute('class')).toBe('branding-logo')
      expect(logo.getAttribute('viewBox')).toBe('0 0 72 72')
      expect(logo.getAttribute('width')).toBe('32')
      expect(logo.getAttribute('height')).toBe('32')
    })

    it('should contain gradient definition', () => {
      const logo = BrandingLink.createLogoSvg()
      const gradient = logo.querySelector('linearGradient')

      expect(gradient).not.toBeNull()
      expect(gradient.getAttribute('id')).toBe('logo-gradient')
    })

    it('should contain three gradient stops', () => {
      const logo = BrandingLink.createLogoSvg()
      const stops = logo.querySelectorAll('stop')

      expect(stops.length).toBe(3)
      expect(stops[0].getAttribute('offset')).toBe('0%')
      expect(stops[1].getAttribute('offset')).toBe('50%')
      expect(stops[2].getAttribute('offset')).toBe('100%')
    })

    it('should contain circle and play button path', () => {
      const logo = BrandingLink.createLogoSvg()
      const circle = logo.querySelector('circle')
      const path = logo.querySelector('path')

      expect(circle).not.toBeNull()
      expect(circle.getAttribute('fill')).toBe('url(#logo-gradient)')
      expect(path).not.toBeNull()
      expect(path.getAttribute('fill')).toBe('#ffffff')
    })
  })

  describe('createLink', () => {
    it('should create anchor element with correct structure', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)

      expect(link.tagName).toBe('A')
      expect(link.className).toBe('branding-link')
    })

    it('should set correct href attribute', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)

      expect(link.href).toBe('https://nostu.be/video/nevent1qqsxyz123abc')
    })

    it('should set security attributes', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)

      expect(link.target).toBe('_blank')
      expect(link.rel).toBe('noopener noreferrer')
    })

    it('should set aria-label for accessibility', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)

      expect(link.getAttribute('aria-label')).toBe('Watch on Nostube')
    })

    it('should contain logo SVG', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)
      const logo = link.querySelector('.branding-logo')

      expect(logo).not.toBeNull()
      expect(logo.tagName).toBe('svg')
    })

    it('should have only logo as child element', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)

      expect(link.children.length).toBe(1)
      expect(link.children[0].getAttribute('class')).toBe('branding-logo')
    })
  })

  describe('show and hide', () => {
    it('should remove hidden class when showing', () => {
      const link = document.createElement('a')
      link.className = 'branding-link hidden'

      BrandingLink.show(link)

      expect(link.classList.contains('hidden')).toBe(false)
    })

    it('should add hidden class when hiding', () => {
      const link = document.createElement('a')
      link.className = 'branding-link'

      BrandingLink.hide(link)

      expect(link.classList.contains('hidden')).toBe(true)
    })
  })

  describe('applyToPlayer', () => {
    it('should add branding link to container when enabled', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: true }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const link = container.querySelector('.branding-link')
      expect(link).not.toBeNull()
    })

    it('should not add branding link when disabled', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: false }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const link = container.querySelector('.branding-link')
      expect(link).toBeNull()
    })

    it('should log when branding is disabled', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: false }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      expect(console.log).toHaveBeenCalledWith(
        '[BrandingLink] Branding link disabled via branding=0 parameter'
      )
    })

    it('should log when branding is applied', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: true }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      expect(console.log).toHaveBeenCalledWith('[BrandingLink] Applying branding link')
      expect(console.log).toHaveBeenCalledWith('[BrandingLink] Branding link applied successfully')
    })

    it('should apply correct video URL to link', () => {
      const videoId = 'naddr1qqxyz456def'
      const params = { showBranding: true }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const link = container.querySelector('.branding-link')
      expect(link.href).toBe('https://nostu.be/video/naddr1qqxyz456def')
    })

    it('should append link as last child of container', () => {
      // Add some existing children
      const existingChild1 = document.createElement('div')
      const existingChild2 = document.createElement('div')
      container.appendChild(existingChild1)
      container.appendChild(existingChild2)

      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: true }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      // Link should be the last child
      const lastChild = container.lastElementChild
      expect(lastChild.className).toBe('branding-link')
    })

    it('should create only one branding link', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: true }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const links = container.querySelectorAll('.branding-link')
      expect(links.length).toBe(1)
    })

    it('should set up event listeners for auto-hide behavior', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: true }

      vi.spyOn(container, 'addEventListener')
      vi.spyOn(videoElement, 'addEventListener')

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      // Container should have mouseenter and mouseleave listeners
      expect(container.addEventListener).toHaveBeenCalledWith('mouseenter', expect.any(Function))
      expect(container.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function))

      // Video should have pause and play listeners
      expect(videoElement.addEventListener).toHaveBeenCalledWith('pause', expect.any(Function))
      expect(videoElement.addEventListener).toHaveBeenCalledWith('play', expect.any(Function))
    })
  })

  describe('Integration scenarios', () => {
    it('should handle default parameters correctly', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: true }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const link = container.querySelector('.branding-link')
      expect(link).not.toBeNull()
      expect(link.href).toBe('https://nostu.be/video/nevent1qqsxyz123abc')
    })

    it('should work with different video identifier formats', () => {
      const testCases = [
        'nevent1qqsxyz123abc',
        'naddr1qqxyz456def',
        'note1abc789xyz',
        'nevent1qqsxyz_123-abc',
      ]

      testCases.forEach(videoId => {
        // Clean container and recreate video element
        container.innerHTML = ''
        const video = document.createElement('video')
        container.appendChild(video)

        const params = { showBranding: true }

        BrandingLink.applyToPlayer(container, video, videoId, params)

        const link = container.querySelector('.branding-link')
        expect(link).not.toBeNull()
        expect(link.href).toBe(`https://nostu.be/video/${videoId}`)
      })
    })

    it('should respect branding=0 parameter', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: false }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const link = container.querySelector('.branding-link')
      expect(link).toBeNull()
    })

    it('should maintain link structure after creation', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const link = BrandingLink.createLink(videoId)

      // Check structure - should contain only the logo
      expect(link.children.length).toBe(1)

      const logo = link.children[0]
      expect(logo.tagName).toBe('svg')
      expect(logo.getAttribute('class')).toBe('branding-logo')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty video ID', () => {
      const videoId = ''
      const url = BrandingLink.generateVideoUrl(videoId)

      expect(url).toBe('https://nostu.be/video/')
    })

    it('should handle very long video IDs', () => {
      const videoId = 'nevent1' + 'a'.repeat(500)
      const url = BrandingLink.generateVideoUrl(videoId)

      expect(url).toBe(`https://nostu.be/video/${videoId}`)
    })

    it('should handle special characters in video ID', () => {
      const videoId = 'nevent1qqsxyz-_123.abc'
      const link = BrandingLink.createLink(videoId)

      expect(link.href).toBe('https://nostu.be/video/nevent1qqsxyz-_123.abc')
    })

    it('should handle undefined params gracefully', () => {
      const videoId = 'nevent1qqsxyz123abc'
      const params = { showBranding: undefined }

      BrandingLink.applyToPlayer(container, videoElement, videoId, params)

      const link = container.querySelector('.branding-link')
      expect(link).toBeNull()
    })
  })
})

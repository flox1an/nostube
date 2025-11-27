/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PlayPauseOverlay } from './play-pause-overlay.js'

describe('PlayPauseOverlay', () => {
  let container
  let videoElement

  beforeEach(() => {
    // Create container
    container = document.createElement('div')
    container.style.position = 'relative'
    document.body.appendChild(container)

    // Create video element
    videoElement = document.createElement('video')
    videoElement.src = 'test-video.mp4'
    container.appendChild(videoElement)

    // Mock timers
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = ''

    // Restore timers
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('applyToPlayer', () => {
    it('should create and attach overlay to container', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')
      expect(overlay).not.toBeNull()
    })

    it('should create overlay with correct structure', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')
      expect(overlay).not.toBeNull()

      const iconContainer = overlay.querySelector('.play-pause-icon-container')
      expect(iconContainer).not.toBeNull()

      const svg = overlay.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg.getAttribute('width')).toBe('56')
      expect(svg.getAttribute('height')).toBe('56')

      const path = overlay.querySelector('path')
      expect(path).not.toBeNull()
    })

    it('should return cleanup function', () => {
      const cleanup = PlayPauseOverlay.applyToPlayer(container, videoElement)

      expect(typeof cleanup).toBe('function')

      // Call cleanup
      cleanup()

      // Overlay should be removed
      const overlay = container.querySelector('.play-pause-overlay')
      expect(overlay).toBeNull()
    })

    it('should attach event listeners to video element', () => {
      const playSpy = vi.fn()
      const pauseSpy = vi.fn()

      videoElement.addEventListener('play', playSpy)
      videoElement.addEventListener('pause', pauseSpy)

      PlayPauseOverlay.applyToPlayer(container, videoElement)

      // Trigger play event
      videoElement.dispatchEvent(new Event('play'))
      expect(playSpy).toHaveBeenCalled()

      // Trigger pause event
      videoElement.dispatchEvent(new Event('pause'))
      expect(pauseSpy).toHaveBeenCalled()
    })
  })

  describe('play event behavior', () => {
    it('should show play icon when video plays', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')
      const path = overlay.querySelector('path')

      // Initially hidden
      expect(overlay.style.display).toBe('none')

      // Trigger play
      videoElement.dispatchEvent(new Event('play'))

      // Should be visible with play icon
      expect(overlay.style.display).toBe('flex')
      expect(path.getAttribute('d')).toBe('M8 5v14l11-7z') // Play icon path
    })

    it('should fade out play icon after 400ms', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')
      const iconContainer = overlay.querySelector('.play-pause-icon-container')

      // Trigger play
      videoElement.dispatchEvent(new Event('play'))

      // Icon should be visible initially
      expect(overlay.style.display).toBe('flex')

      // Fast-forward 400ms
      vi.advanceTimersByTime(400)

      // Icon should start fading out (opacity 0)
      expect(iconContainer.style.opacity).toBe('0')

      // Fast-forward another 100ms for fade-out to complete
      vi.advanceTimersByTime(100)

      // Overlay should be hidden
      expect(overlay.style.display).toBe('none')
    })

    it('should clear existing timeouts when play triggers again', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')

      // First play
      videoElement.dispatchEvent(new Event('play'))
      expect(overlay.style.display).toBe('flex')

      // Fast-forward 200ms (half-way to fade-out)
      vi.advanceTimersByTime(200)

      // Second play (should reset timer)
      videoElement.dispatchEvent(new Event('play'))

      // Fast-forward 300ms (total 500ms from first play, 300ms from second)
      vi.advanceTimersByTime(300)

      // Should still be visible (new timeout not expired yet)
      expect(overlay.style.display).toBe('flex')

      // Fast-forward remaining 200ms (400ms from second play)
      vi.advanceTimersByTime(200)

      // Now should be hidden
      vi.advanceTimersByTime(100) // fade-out duration
      expect(overlay.style.display).toBe('none')
    })
  })

  describe('pause event behavior', () => {
    it('should show pause icon when video pauses', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')
      const path = overlay.querySelector('path')

      // Trigger pause
      videoElement.dispatchEvent(new Event('pause'))

      // Should be visible with pause icon
      expect(overlay.style.display).toBe('flex')
      expect(path.getAttribute('d')).toBe('M6 4h4v16H6V4zm8 0h4v16h-4V4z') // Pause icon path
    })

    it('should fade out pause icon after 400ms', () => {
      PlayPauseOverlay.applyToPlayer(container, videoElement)

      const overlay = container.querySelector('.play-pause-overlay')

      // Trigger pause
      videoElement.dispatchEvent(new Event('pause'))

      // Icon should be visible initially
      expect(overlay.style.display).toBe('flex')

      // Fast-forward 400ms
      vi.advanceTimersByTime(400)

      // Fast-forward another 100ms for fade-out to complete
      vi.advanceTimersByTime(100)

      // Overlay should be hidden
      expect(overlay.style.display).toBe('none')
    })
  })

  describe('createOverlay', () => {
    it('should create overlay with correct initial styles', () => {
      const overlay = PlayPauseOverlay.createOverlay()

      expect(overlay.className).toBe('play-pause-overlay')
      expect(overlay.style.position).toBe('absolute')
      expect(overlay.style.display).toBe('none')
      expect(overlay.style.zIndex).toBe('10')
    })

    it('should store references for icon container and path', () => {
      const overlay = PlayPauseOverlay.createOverlay()

      expect(overlay._iconContainer).toBeDefined()
      expect(overlay._iconPath).toBeDefined()
    })

    it('should create icon container with correct styles', () => {
      const overlay = PlayPauseOverlay.createOverlay()
      const iconContainer = overlay._iconContainer

      expect(iconContainer.className).toBe('play-pause-icon-container')
      expect(iconContainer.style.borderRadius).toBe('50%')
      expect(iconContainer.style.opacity).toBe('0')
    })
  })

  describe('showIcon', () => {
    it('should show play icon with correct path', () => {
      const overlay = PlayPauseOverlay.createOverlay()

      PlayPauseOverlay.showIcon(overlay, false) // false = play

      expect(overlay.style.display).toBe('flex')
      expect(overlay._iconPath.getAttribute('d')).toBe('M8 5v14l11-7z')
    })

    it('should show pause icon with correct path', () => {
      const overlay = PlayPauseOverlay.createOverlay()

      PlayPauseOverlay.showIcon(overlay, true) // true = pause

      expect(overlay.style.display).toBe('flex')
      expect(overlay._iconPath.getAttribute('d')).toBe('M6 4h4v16H6V4zm8 0h4v16h-4V4z')
    })

    it('should trigger fade-in animation via requestAnimationFrame', () => {
      const overlay = PlayPauseOverlay.createOverlay()

      // Mock requestAnimationFrame to execute callback immediately
      const originalRAF = global.requestAnimationFrame
      global.requestAnimationFrame = cb => {
        cb()
        return 0
      }

      PlayPauseOverlay.showIcon(overlay, false)

      // After requestAnimationFrame, opacity should be 1
      expect(overlay._iconContainer.style.opacity).toBe('1')
      expect(overlay._iconContainer.style.transform).toBe('scale(1)')

      // Restore
      global.requestAnimationFrame = originalRAF
    })
  })

  describe('startFadeOut', () => {
    it('should set opacity to 0 and scale to 0.8', () => {
      const overlay = PlayPauseOverlay.createOverlay()
      overlay._iconContainer.style.opacity = '1'
      overlay._iconContainer.style.transform = 'scale(1)'

      PlayPauseOverlay.startFadeOut(overlay)

      expect(overlay._iconContainer.style.opacity).toBe('0')
      expect(overlay._iconContainer.style.transform).toBe('scale(0.8)')
    })
  })

  describe('hideIcon', () => {
    it('should set display to none', () => {
      const overlay = PlayPauseOverlay.createOverlay()
      overlay.style.display = 'flex'

      PlayPauseOverlay.hideIcon(overlay)

      expect(overlay.style.display).toBe('none')
    })
  })

  describe('cleanup', () => {
    it('should remove event listeners on cleanup', () => {
      const cleanup = PlayPauseOverlay.applyToPlayer(container, videoElement)

      // Trigger play
      videoElement.dispatchEvent(new Event('play'))

      const overlay = container.querySelector('.play-pause-overlay')
      expect(overlay.style.display).toBe('flex')

      // Cleanup
      cleanup()

      // Trigger play again - should not affect removed overlay
      videoElement.dispatchEvent(new Event('play'))

      // Overlay should be gone
      const overlayAfter = container.querySelector('.play-pause-overlay')
      expect(overlayAfter).toBeNull()
    })

    it('should clear timeouts on cleanup', () => {
      const cleanup = PlayPauseOverlay.applyToPlayer(container, videoElement)

      // Trigger play to start timers
      videoElement.dispatchEvent(new Event('play'))

      // Cleanup before timers expire
      cleanup()

      // Fast-forward time
      vi.advanceTimersByTime(1000)

      // Nothing should happen (no errors)
      expect(true).toBe(true)
    })
  })
})

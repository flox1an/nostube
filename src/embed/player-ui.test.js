/**
 * Unit tests for PlayerUI class
 * Tests video player DOM building functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PlayerUI } from './player-ui.js'

describe('PlayerUI', () => {
  let mockVideo
  let mockParams

  beforeEach(() => {
    // Mock video metadata
    mockVideo = {
      id: 'test123',
      kind: 34235,
      title: 'Test Video',
      description: 'Test description',
      author: 'pubkey123',
      createdAt: 1234567890,
      duration: 120,
      videoVariants: [
        {
          url: 'https://example.com/video1.mp4',
          mimeType: 'video/mp4',
          dimensions: '1920x1080',
          fallbackUrls: ['https://fallback1.com/video1.mp4'],
        },
        {
          url: 'https://example.com/video2.mp4',
          mimeType: 'video/mp4',
          dimensions: '1280x720',
          fallbackUrls: [],
        },
      ],
      thumbnails: [
        {
          url: 'https://example.com/thumb.jpg',
          fallbackUrls: [],
        },
      ],
    }

    // Mock URL parameters
    mockParams = {
      videoId: 'nevent123',
      autoplay: false,
      muted: false,
      loop: false,
      showControls: true,
      startTime: 0,
      preferredQuality: 'auto',
    }
  })

  describe('createVideoElement', () => {
    it('should create a video element with basic attributes', () => {
      const video = PlayerUI.createVideoElement(mockParams)

      expect(video).toBeInstanceOf(HTMLVideoElement)
      expect(video.className).toBe('nostube-video')
      expect(video.preload).toBe('metadata')
      expect(video.controls).toBe(true)
    })

    it('should apply autoplay and mute when autoplay is enabled', () => {
      mockParams.autoplay = true
      const video = PlayerUI.createVideoElement(mockParams)

      expect(video.autoplay).toBe(true)
      expect(video.muted).toBe(true) // Required for autoplay
    })

    it('should apply muted attribute', () => {
      mockParams.muted = true
      const video = PlayerUI.createVideoElement(mockParams)

      expect(video.muted).toBe(true)
    })

    it('should apply loop attribute', () => {
      mockParams.loop = true
      const video = PlayerUI.createVideoElement(mockParams)

      expect(video.loop).toBe(true)
    })

    it('should hide controls when showControls is false', () => {
      mockParams.showControls = false
      const video = PlayerUI.createVideoElement(mockParams)

      expect(video.controls).toBe(false)
    })

    it('should add playsinline attributes', () => {
      const video = PlayerUI.createVideoElement(mockParams)

      expect(video.getAttribute('playsinline')).toBe('')
      expect(video.getAttribute('webkit-playsinline')).toBe('')
    })
  })

  describe('addVideoSources', () => {
    it('should add all video variants as sources', () => {
      const video = document.createElement('video')
      PlayerUI.addVideoSources(video, mockVideo.videoVariants)

      const sources = video.querySelectorAll('source')
      // 2 primary + 1 fallback = 3 sources
      expect(sources.length).toBeGreaterThanOrEqual(3)
    })

    it('should set MIME type on sources', () => {
      const video = document.createElement('video')
      PlayerUI.addVideoSources(video, mockVideo.videoVariants)

      const sources = video.querySelectorAll('source')
      expect(sources[0].type).toBe('video/mp4')
    })

    it('should add fallback URLs for variants', () => {
      const video = document.createElement('video')
      PlayerUI.addVideoSources(video, mockVideo.videoVariants)

      const sources = Array.from(video.querySelectorAll('source'))
      const urls = sources.map(s => s.src)

      expect(urls).toContain('https://example.com/video1.mp4')
      expect(urls).toContain('https://fallback1.com/video1.mp4')
      expect(urls).toContain('https://example.com/video2.mp4')
    })

    it('should throw error when no video sources provided', () => {
      const video = document.createElement('video')

      expect(() => {
        PlayerUI.addVideoSources(video, [])
      }).toThrow('No video sources available')
    })

    it('should add browser compatibility message', () => {
      const video = document.createElement('video')
      PlayerUI.addVideoSources(video, mockVideo.videoVariants)

      const message = video.querySelector('p')
      expect(message).toBeTruthy()
      expect(message.textContent).toContain('browser does not support')
    })
  })

  describe('setPoster', () => {
    it('should set poster attribute from thumbnail', () => {
      const video = document.createElement('video')
      PlayerUI.setPoster(video, mockVideo.thumbnails)

      expect(video.poster).toBe('https://example.com/thumb.jpg')
    })

    it('should handle missing thumbnails gracefully', () => {
      const video = document.createElement('video')
      PlayerUI.setPoster(video, [])

      expect(video.poster).toBe('')
    })

    it('should handle undefined thumbnails', () => {
      const video = document.createElement('video')
      PlayerUI.setPoster(video, undefined)

      expect(video.poster).toBe('')
    })
  })

  describe('setStartTime', () => {
    it('should seek to start time when metadata is loaded', () => {
      const video = document.createElement('video')
      Object.defineProperty(video, 'duration', { value: 120, writable: true })
      Object.defineProperty(video, 'readyState', { value: 1, writable: true })

      PlayerUI.setStartTime(video, 30)

      // Manually trigger loadedmetadata since we can't load real video
      video.dispatchEvent(new Event('loadedmetadata'))

      expect(video.currentTime).toBe(30)
    })

    it('should not seek if start time exceeds duration', () => {
      const video = document.createElement('video')
      Object.defineProperty(video, 'duration', { value: 60, writable: true })
      Object.defineProperty(video, 'readyState', { value: 1, writable: true })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      PlayerUI.setStartTime(video, 120)
      video.dispatchEvent(new Event('loadedmetadata'))

      expect(video.currentTime).toBe(0)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('addErrorHandling', () => {
    it('should attach error event listener', () => {
      const video = document.createElement('video')
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      PlayerUI.addErrorHandling(video)

      // Simulate error
      video.dispatchEvent(new Event('error'))

      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should attach loadeddata event listener', () => {
      const video = document.createElement('video')
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      PlayerUI.addErrorHandling(video)
      video.dispatchEvent(new Event('loadeddata'))

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Video loaded successfully')
      )

      consoleLogSpy.mockRestore()
    })
  })

  describe('buildVideoPlayer', () => {
    it('should build complete video player', () => {
      const video = PlayerUI.buildVideoPlayer(mockVideo, mockParams)

      expect(video).toBeInstanceOf(HTMLVideoElement)
      expect(video.className).toBe('nostube-video')
      expect(video.controls).toBe(true)

      const sources = video.querySelectorAll('source')
      expect(sources.length).toBeGreaterThan(0)
    })

    it('should apply all parameters', () => {
      mockParams.autoplay = true
      mockParams.loop = true
      mockParams.startTime = 10

      const video = PlayerUI.buildVideoPlayer(mockVideo, mockParams)

      expect(video.autoplay).toBe(true)
      expect(video.muted).toBe(true) // Required for autoplay
      expect(video.loop).toBe(true)
      expect(video.poster).toBe('https://example.com/thumb.jpg')
    })

    it('should throw error when no video sources', () => {
      mockVideo.videoVariants = []

      expect(() => {
        PlayerUI.buildVideoPlayer(mockVideo, mockParams)
      }).toThrow('No video sources available')
    })
  })

  describe('createPlayerContainer', () => {
    it('should create container div with video element', () => {
      const video = document.createElement('video')
      const container = PlayerUI.createPlayerContainer(video)

      expect(container).toBeInstanceOf(HTMLDivElement)
      expect(container.className).toBe('nostube-player-container')
      expect(container.firstChild).toBe(video)
    })
  })
})

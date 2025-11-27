/**
 * PlayerUI - Builds the video player DOM
 *
 * Handles:
 * - HTML5 video element creation
 * - Multiple source fallbacks
 * - Poster/thumbnail display
 * - Playback parameters (autoplay, muted, loop, controls)
 * - Start time seeking
 *
 * Design: Native HTML5 controls, no custom player library (v1)
 */

export class PlayerUI {
  /**
   * Build the complete video player
   * @param {Object} video - Parsed video metadata from parseVideoEvent()
   * @param {Object} params - URL parameters
   * @returns {HTMLVideoElement} Configured video element
   */
  static buildVideoPlayer(video, params) {
    console.log('[PlayerUI] Building video player with params:', params)

    // Create base video element
    const videoElement = this.createVideoElement(params)

    // Add video sources with fallbacks
    this.addVideoSources(videoElement, video.videoVariants)

    // Set poster/thumbnail
    this.setPoster(videoElement, video.thumbnails)

    // Apply start time if specified
    if (params.startTime > 0) {
      this.setStartTime(videoElement, params.startTime)
    }

    // Add error handling
    this.addErrorHandling(videoElement)

    console.log('[PlayerUI] Video player built successfully')
    return videoElement
  }

  /**
   * Create base HTML5 video element with attributes
   * @param {Object} params - URL parameters
   * @returns {HTMLVideoElement}
   */
  static createVideoElement(params) {
    const video = document.createElement('video')

    // Core video attributes
    video.className = 'nostube-video'
    video.preload = 'metadata'

    // Apply playback parameters
    if (params.autoplay) {
      video.autoplay = true
      // Browsers require muted for autoplay
      video.muted = true
    }

    if (params.muted) {
      video.muted = true
    }

    if (params.loop) {
      video.loop = true
    }

    if (params.showControls) {
      video.controls = true
    }

    // Enable fullscreen
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')

    return video
  }

  /**
   * Add video sources with fallback URLs
   * Adds multiple <source> elements for browser fallback
   * @param {HTMLVideoElement} videoElement
   * @param {Array} videoVariants - Array of video variants
   */
  static addVideoSources(videoElement, videoVariants) {
    if (!videoVariants || videoVariants.length === 0) {
      throw new Error('No video sources available')
    }

    console.log(`[PlayerUI] Adding ${videoVariants.length} video variants as sources`)

    // Add all variants as sources (browser will try in order)
    videoVariants.forEach((variant, index) => {
      // Add primary URL
      const source = document.createElement('source')
      source.src = variant.url

      // Set MIME type if available
      if (variant.mimeType) {
        source.type = variant.mimeType
      }

      videoElement.appendChild(source)
      console.log(`[PlayerUI] Added source ${index + 1}: ${variant.url}`)

      // Add fallback URLs for this variant
      if (variant.fallbackUrls && variant.fallbackUrls.length > 0) {
        variant.fallbackUrls.forEach((fallbackUrl, fallbackIndex) => {
          const fallbackSource = document.createElement('source')
          fallbackSource.src = fallbackUrl

          if (variant.mimeType) {
            fallbackSource.type = variant.mimeType
          }

          videoElement.appendChild(fallbackSource)
          console.log(
            `[PlayerUI] Added fallback ${fallbackIndex + 1} for variant ${index + 1}: ${fallbackUrl}`
          )
        })
      }
    })

    // Add browser compatibility message
    const message = document.createElement('p')
    message.textContent = 'Your browser does not support the video tag.'
    message.style.color = '#999'
    message.style.textAlign = 'center'
    message.style.padding = '20px'
    videoElement.appendChild(message)
  }

  /**
   * Set poster/thumbnail image
   * @param {HTMLVideoElement} videoElement
   * @param {Array} thumbnails - Array of thumbnail objects
   */
  static setPoster(videoElement, thumbnails) {
    if (!thumbnails || thumbnails.length === 0) {
      console.log('[PlayerUI] No thumbnail available')
      return
    }

    // Use first thumbnail
    const thumbnail = thumbnails[0]
    if (thumbnail.url) {
      videoElement.poster = thumbnail.url
      console.log('[PlayerUI] Set poster:', thumbnail.url)
    }
  }

  /**
   * Set start time (seek to position when ready)
   * @param {HTMLVideoElement} videoElement
   * @param {number} startTime - Start time in seconds
   */
  static setStartTime(videoElement, startTime) {
    console.log(`[PlayerUI] Setting start time: ${startTime}s`)

    // Wait for metadata to load before seeking
    const handleLoadedMetadata = () => {
      if (videoElement.duration >= startTime) {
        videoElement.currentTime = startTime
        console.log(`[PlayerUI] Seeked to ${startTime}s`)
      } else {
        console.warn(
          `[PlayerUI] Start time ${startTime}s exceeds video duration ${videoElement.duration}s`
        )
      }
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }

    // If metadata already loaded, seek immediately
    if (videoElement.readyState >= 1) {
      handleLoadedMetadata()
    } else {
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }

  /**
   * Add error handling for video load failures
   * @param {HTMLVideoElement} videoElement
   */
  static addErrorHandling(videoElement) {
    videoElement.addEventListener('error', e => {
      const error = videoElement.error
      let message = 'Video failed to load'

      if (error) {
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            message = 'Video loading aborted'
            break
          case error.MEDIA_ERR_NETWORK:
            message = 'Network error while loading video'
            break
          case error.MEDIA_ERR_DECODE:
            message = 'Video decoding error'
            break
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message = 'Video format not supported'
            break
        }
      }

      console.error('[PlayerUI] Video error:', message, error)
    })

    // Track successful load
    videoElement.addEventListener('loadeddata', () => {
      console.log('[PlayerUI] Video loaded successfully')
    })

    videoElement.addEventListener('canplay', () => {
      console.log('[PlayerUI] Video ready to play')
    })
  }

  /**
   * Create a container div for the video player
   * Wraps the video element for better layout control
   * @param {HTMLVideoElement} videoElement
   * @returns {HTMLDivElement}
   */
  static createPlayerContainer(videoElement) {
    const container = document.createElement('div')
    container.className = 'nostube-player-container'
    container.appendChild(videoElement)
    return container
  }
}

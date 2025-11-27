/**
 * PlayPauseOverlay - Animated play/pause indicator for video player
 *
 * Shows an animated icon when video playback state changes.
 * Icon appears with fade-in, then fades out after 400ms.
 *
 * Behavior:
 * - Shows play icon (triangle) when video starts playing
 * - Shows pause icon (two bars) when video pauses
 * - Fades in quickly, fades out after 400ms
 * - Automatically cleans up timeouts and event listeners
 */

export class PlayPauseOverlay {
  /**
   * Create and attach play/pause overlay to video player
   * @param {HTMLElement} container - Player container element
   * @param {HTMLVideoElement} videoElement - Video element to monitor
   */
  static applyToPlayer(container, videoElement) {
    console.log('[PlayPauseOverlay] Applying play/pause overlay')

    // Create overlay element
    const overlay = PlayPauseOverlay.createOverlay()
    container.appendChild(overlay)

    // State management
    let playPauseTimeout = null
    let fadeOutTimeout = null

    // Handler for play event
    const handlePlay = () => {
      PlayPauseOverlay.showIcon(overlay, false) // false = play icon
      clearTimeout(playPauseTimeout)
      clearTimeout(fadeOutTimeout)

      // Start fade-out after 400ms
      playPauseTimeout = setTimeout(() => {
        PlayPauseOverlay.startFadeOut(overlay)

        // Hide icon after fade-out animation completes (100ms)
        fadeOutTimeout = setTimeout(() => {
          PlayPauseOverlay.hideIcon(overlay)
          playPauseTimeout = null
          fadeOutTimeout = null
        }, 100)
      }, 400)
    }

    // Handler for pause event
    const handlePause = () => {
      PlayPauseOverlay.showIcon(overlay, true) // true = pause icon
      clearTimeout(playPauseTimeout)
      clearTimeout(fadeOutTimeout)

      // Start fade-out after 400ms
      playPauseTimeout = setTimeout(() => {
        PlayPauseOverlay.startFadeOut(overlay)

        // Hide icon after fade-out animation completes (100ms)
        fadeOutTimeout = setTimeout(() => {
          PlayPauseOverlay.hideIcon(overlay)
          playPauseTimeout = null
          fadeOutTimeout = null
        }, 100)
      }, 400)
    }

    // Attach event listeners
    videoElement.addEventListener('play', handlePlay)
    videoElement.addEventListener('pause', handlePause)

    console.log('[PlayPauseOverlay] Overlay applied successfully')

    // Return cleanup function
    return () => {
      videoElement.removeEventListener('play', handlePlay)
      videoElement.removeEventListener('pause', handlePause)
      clearTimeout(playPauseTimeout)
      clearTimeout(fadeOutTimeout)
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }
    }
  }

  /**
   * Create overlay DOM structure
   * @returns {HTMLElement} Overlay element
   */
  static createOverlay() {
    const overlay = document.createElement('div')
    overlay.className = 'play-pause-overlay'
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 10;
    `

    // Icon container with background
    const iconContainer = document.createElement('div')
    iconContainer.className = 'play-pause-icon-container'
    iconContainer.style.cssText = `
      background: rgba(0, 0, 0, 0.5);
      border-radius: 50%;
      padding: 12px;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 0.1s ease-out, transform 0.1s ease-out;
    `

    // SVG icon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '56')
    svg.setAttribute('height', '56')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'currentColor')
    svg.style.cssText = 'color: white; margin-top:2px;'

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    svg.appendChild(path)

    iconContainer.appendChild(svg)
    overlay.appendChild(iconContainer)

    // Store references for later updates
    overlay._iconContainer = iconContainer
    overlay._iconPath = path

    return overlay
  }

  /**
   * Show icon with fade-in animation
   * @param {HTMLElement} overlay - Overlay element
   * @param {boolean} isPaused - True for pause icon, false for play icon
   */
  static showIcon(overlay, isPaused) {
    overlay.style.display = 'flex'

    // Update icon based on state
    if (isPaused) {
      // Pause icon (two rectangles)
      overlay._iconPath.setAttribute('d', 'M6 4h4v16H6V4zm8 0h4v16h-4V4z')
    } else {
      // Play icon (triangle pointing right)
      overlay._iconPath.setAttribute('d', 'M8 5v14l11-7z')
    }

    // Trigger fade-in animation
    requestAnimationFrame(() => {
      overlay._iconContainer.style.opacity = '1'
      overlay._iconContainer.style.transform = 'scale(1)'
    })
  }

  /**
   * Start fade-out animation
   * @param {HTMLElement} overlay - Overlay element
   */
  static startFadeOut(overlay) {
    overlay._iconContainer.style.opacity = '0'
    overlay._iconContainer.style.transform = 'scale(0.8)'
  }

  /**
   * Hide icon after fade-out completes
   * @param {HTMLElement} overlay - Overlay element
   */
  static hideIcon(overlay) {
    overlay.style.display = 'none'
  }
}

/**
 * ContentWarning - Handles sensitive content overlays
 *
 * Safety feature: Content warnings cannot be bypassed via URL parameters.
 * Always shown when video event has a content-warning tag.
 *
 * Behavior:
 * - Shows blurred poster with dark overlay
 * - Displays warning icon + message
 * - Click anywhere to reveal video
 * - State persists (no re-blur on pause)
 */

export class ContentWarning {
  /**
   * Check if video has content warning
   * @param {Object} videoMetadata - Parsed video metadata from parseVideoEvent()
   * @returns {string|null} Warning message or null if no warning
   */
  static getWarningMessage(videoMetadata) {
    // Check for contentWarning field (already parsed by video-parser)
    if (videoMetadata?.contentWarning) {
      return videoMetadata.contentWarning
    }

    // Fallback: check tags directly (defensive coding)
    const tags = videoMetadata?.event?.tags || []
    const warningTag = tags.find(tag => tag[0] === 'content-warning')
    return warningTag?.[1] || null
  }

  /**
   * Create content warning overlay element
   * @param {string} warningMessage - Warning text from event
   * @param {string} posterUrl - Thumbnail URL for blurred background
   * @returns {HTMLElement} Overlay element
   */
  static createOverlay(warningMessage, posterUrl) {
    // Main overlay container
    const overlay = document.createElement('div')
    overlay.className = 'content-warning-overlay'

    // Blurred background layer
    const background = document.createElement('div')
    background.className = 'content-warning-background'
    if (posterUrl) {
      background.style.backgroundImage = `url(${posterUrl})`
    }

    // Dark semi-transparent overlay
    const darkOverlay = document.createElement('div')
    darkOverlay.className = 'content-warning-dark-overlay'

    // Content container (centered)
    const content = document.createElement('div')
    content.className = 'content-warning-content'

    // Warning icon
    const icon = document.createElement('div')
    icon.className = 'content-warning-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '⚠️'

    // Heading
    const heading = document.createElement('h2')
    heading.className = 'content-warning-heading'
    heading.textContent = 'Sensitive Content'

    // Message text
    const message = document.createElement('p')
    message.className = 'content-warning-message'
    message.textContent = warningMessage || 'This video may contain sensitive content'

    // Reveal button
    const button = document.createElement('button')
    button.className = 'content-warning-button'
    button.textContent = 'Click to reveal'
    button.setAttribute('type', 'button')
    button.setAttribute('aria-label', 'Reveal sensitive content')

    // Assemble content
    content.appendChild(icon)
    content.appendChild(heading)
    content.appendChild(message)
    content.appendChild(button)

    // Assemble overlay layers
    overlay.appendChild(background)
    overlay.appendChild(darkOverlay)
    overlay.appendChild(content)

    return overlay
  }

  /**
   * Apply content warning overlay to video player
   * Checks for warning, creates overlay, handles reveal interaction
   * @param {HTMLElement} container - Player container element
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {Object} videoMetadata - Parsed video metadata
   */
  static applyToPlayer(container, videoElement, videoMetadata) {
    // Check if video has content warning
    const warningMessage = ContentWarning.getWarningMessage(videoMetadata)

    if (!warningMessage) {
      // No warning needed - video plays normally
      return
    }

    console.log('[ContentWarning] Applying content warning:', warningMessage)

    // Get poster URL for blurred background
    const posterUrl = videoElement.poster || videoMetadata.thumbnails?.[0]?.url || ''

    // Create overlay
    const overlay = ContentWarning.createOverlay(warningMessage, posterUrl)

    // Hide controls and pause video initially
    videoElement.controls = false
    videoElement.pause()

    // Click anywhere on overlay to reveal
    overlay.addEventListener('click', () => {
      console.log('[ContentWarning] Content revealed by user')

      // Remove overlay from DOM (state persists)
      overlay.remove()

      // Show video controls
      videoElement.controls = true

      // Video is ready to play (user can press play)
      // Don't auto-play here - let user decide
    })

    // Keyboard accessibility: Enter or Space to reveal
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        overlay.click()
      }
    })

    // Make overlay keyboard focusable
    overlay.setAttribute('tabindex', '0')
    overlay.setAttribute('role', 'button')
    overlay.setAttribute('aria-label', 'Sensitive content warning. Press Enter to reveal.')

    // Add to container
    container.appendChild(overlay)

    console.log('[ContentWarning] Overlay applied successfully')
  }
}

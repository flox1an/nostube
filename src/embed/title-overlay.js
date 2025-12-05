import { nip19 } from 'nostr-tools'

/**
 * TitleOverlay - Displays video title and author information
 *
 * Shows video metadata at the top and author info at the bottom.
 * Auto-hides after 3 seconds, reappears on hover/pause.
 *
 * Behavior:
 * - Initially visible for 3 seconds
 * - Fades out during playback
 * - Reappears on hover
 * - Reappears on pause
 * - Hides on play
 * - Can be disabled via title=0 parameter
 */

export class TitleOverlay {
  /**
   * Generate Nostube video URL
   * @param {string} videoId - Video identifier (nevent/naddr)
   * @param {number} [timestamp] - Optional timestamp in seconds to jump to
   * @returns {string} Full Nostube URL
   */
  static generateVideoUrl(videoId, timestamp) {
    const baseUrl = `https://nostu.be/video/${videoId}`

    // Only add timestamp if it's a valid positive number
    if (timestamp && timestamp > 0) {
      const roundedTimestamp = Math.round(timestamp)
      return `${baseUrl}?t=${roundedTimestamp}`
    }

    return baseUrl
  }

  /**
   * Generate Nostube author profile URL using nprofile
   * @param {string} pubkey - Author's hex pubkey
   * @param {string[]} relays - Relay hints for the profile
   * @returns {string} Full Nostube author URL
   */
  static generateAuthorUrl(pubkey, relays = []) {
    try {
      const nprofile = nip19.nprofileEncode({
        pubkey,
        relays: relays.slice(0, 3), // Limit to 3 relays for shorter URL
      })
      return `https://nostu.be/author/${nprofile}`
    } catch (error) {
      console.error('[TitleOverlay] Failed to encode nprofile:', error)
      // Fallback to npub if nprofile fails
      try {
        const npub = nip19.npubEncode(pubkey)
        return `https://nostu.be/author/${npub}`
      } catch {
        return null
      }
    }
  }

  /**
   * Create title overlay element with video metadata
   * @param {Object} videoMetadata - Parsed video event from parseVideoEvent()
   * @param {string} videoId - Video identifier for link
   * @param {string[]} relays - Relay hints for author profile link
   * @param {HTMLVideoElement} videoElement - Video element to get current time from
   * @returns {HTMLElement} Overlay element
   */
  static createOverlay(videoMetadata, videoId, relays = [], videoElement = null) {
    // Main overlay container
    const overlay = document.createElement('div')
    overlay.className = 'title-overlay'
    overlay.setAttribute('aria-hidden', 'true') // Decorative, hidden from screen readers

    // Title section (top)
    const titleSection = document.createElement('div')
    titleSection.className = 'title-section'

    // Title as link to Nostube
    const titleLink = document.createElement('a')
    titleLink.className = 'video-title-link'
    titleLink.href = TitleOverlay.generateVideoUrl(videoId)
    titleLink.target = '_blank'
    titleLink.rel = 'noopener noreferrer'
    titleLink.setAttribute('aria-label', 'Watch on Nostube')

    // Update href with current timestamp when clicked
    if (videoElement) {
      titleLink.addEventListener('click', e => {
        const currentTime = videoElement.currentTime
        titleLink.href = TitleOverlay.generateVideoUrl(videoId, currentTime)
      })
    }

    const titleEl = document.createElement('h1')
    titleEl.className = 'video-title'
    titleEl.textContent = TitleOverlay.truncateTitle(videoMetadata.title || 'Untitled Video')

    titleLink.appendChild(titleEl)
    titleSection.appendChild(titleLink)

    // Author section (bottom-left) - wrapped in link to author profile
    const authorSection = document.createElement('div')
    authorSection.className = 'author-section'

    // Author link wrapper
    const authorUrl = videoMetadata.author
      ? TitleOverlay.generateAuthorUrl(videoMetadata.author, relays)
      : null

    const authorLink = document.createElement('a')
    authorLink.className = 'author-link'
    if (authorUrl) {
      authorLink.href = authorUrl
      authorLink.target = '_blank'
      authorLink.rel = 'noopener noreferrer'
    }
    authorLink.setAttribute('aria-label', 'View author profile on Nostube')

    // Author avatar
    const avatar = document.createElement('img')
    avatar.className = 'author-avatar'
    avatar.src = videoMetadata.authorAvatar || TitleOverlay.getDefaultAvatar()
    avatar.alt = videoMetadata.authorName || 'Author'
    avatar.onerror = () => {
      // Fallback to default avatar on load error
      avatar.src = TitleOverlay.getDefaultAvatar()
    }

    // Author name
    const authorName = document.createElement('p')
    authorName.className = 'author-name'
    authorName.textContent =
      videoMetadata.authorName || TitleOverlay.formatPubkey(videoMetadata.author)

    authorLink.appendChild(avatar)
    authorLink.appendChild(authorName)
    authorSection.appendChild(authorLink)

    // Assemble overlay
    overlay.appendChild(titleSection)
    overlay.appendChild(authorSection)

    return overlay
  }

  /**
   * Apply title overlay to video player with auto-hide behavior
   * @param {HTMLElement} container - Player container element
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {Object} videoMetadata - Parsed video metadata
   * @param {Object} params - URL parameters from parseURLParams()
   * @param {string[]} relays - Relay hints for author profile link
   */
  static applyToPlayer(container, videoElement, videoMetadata, params, relays = []) {
    // Check if title overlay should be shown
    if (!params.showTitle) {
      console.log('[TitleOverlay] Title overlay disabled via title=0 parameter')
      return
    }

    console.log('[TitleOverlay] Applying title overlay')

    // Create overlay with videoId, relays, and videoElement for links
    const overlay = TitleOverlay.createOverlay(videoMetadata, params.videoId, relays, videoElement)
    container.appendChild(overlay)

    // Auto-hide timer
    let hideTimer = null

    // Start initial auto-hide timer (3 seconds)
    const startAutoHideTimer = () => {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        if (!videoElement.paused) {
          TitleOverlay.hide(overlay)
        }
      }, 3000)
    }

    // Show overlay on hover
    container.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer)
      TitleOverlay.show(overlay)
    })

    // Hide overlay on mouse leave (if playing)
    container.addEventListener('mouseleave', () => {
      if (!videoElement.paused) {
        TitleOverlay.hide(overlay)
      }
    })

    // Show overlay on pause
    videoElement.addEventListener('pause', () => {
      clearTimeout(hideTimer)
      TitleOverlay.show(overlay)
    })

    // Hide overlay on play
    videoElement.addEventListener('play', () => {
      clearTimeout(hideTimer)
      TitleOverlay.hide(overlay)
    })

    // Start initial auto-hide timer
    startAutoHideTimer()

    console.log('[TitleOverlay] Overlay applied successfully')
  }

  /**
   * Show overlay with fade-in animation
   * @param {HTMLElement} overlay - Overlay element
   */
  static show(overlay) {
    overlay.classList.remove('hidden')
  }

  /**
   * Hide overlay with fade-out animation
   * @param {HTMLElement} overlay - Overlay element
   */
  static hide(overlay) {
    overlay.classList.add('hidden')
  }

  /**
   * Truncate long titles with ellipsis
   * @param {string} title - Video title
   * @param {number} maxLength - Maximum length before truncation
   * @returns {string} Truncated title
   */
  static truncateTitle(title, maxLength = 70) {
    if (!title) return 'Untitled Video'
    if (title.length <= maxLength) return title
    return title.substring(0, maxLength) + '...'
  }

  /**
   * Format pubkey as shortened hex string
   * @param {string} pubkey - Hex pubkey
   * @returns {string} Formatted pubkey (e.g., "abcd1234...wxyz9876")
   */
  static formatPubkey(pubkey) {
    if (!pubkey || pubkey.length < 12) return 'Anonymous'
    return `${pubkey.substring(0, 8)}...${pubkey.substring(pubkey.length - 4)}`
  }

  /**
   * Get default avatar as data URL
   * @returns {string} Data URL for default avatar
   */
  static getDefaultAvatar() {
    // Simple SVG avatar with user icon
    return (
      'data:image/svg+xml,' +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
        <rect width="32" height="32" fill="#6b7280"/>
        <circle cx="16" cy="12" r="5" fill="#fff"/>
        <path d="M 8 26 Q 8 20 16 20 Q 24 20 24 26 Z" fill="#fff"/>
      </svg>
    `)
    )
  }

  /**
   * Update overlay with profile data (for live updates after initial render)
   * @param {HTMLElement} overlay - Overlay element
   * @param {Object} profile - Profile data {picture, displayName, name}
   */
  static updateProfile(overlay, profile) {
    if (!overlay) {
      console.warn('[TitleOverlay] Cannot update profile: overlay not found')
      return
    }

    if (!profile) {
      console.warn('[TitleOverlay] Cannot update profile: profile is null')
      return
    }

    console.log('[TitleOverlay] Updating profile:', profile)

    // Update avatar
    const avatar = overlay.querySelector('.author-avatar')
    if (avatar && profile.picture) {
      avatar.src = profile.picture
      console.log('[TitleOverlay] Updated avatar')
    }

    // Update author name (prefer displayName, fallback to name)
    const authorName = overlay.querySelector('.author-name')
    if (authorName) {
      const newName = profile.displayName || profile.name
      if (newName) {
        authorName.textContent = newName
        console.log('[TitleOverlay] Updated author name to:', newName)
      }
    }
  }
}

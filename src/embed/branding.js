/**
 * BrandingLink - Nostube logo link in top-right corner
 *
 * Displays the Nostube logo as a clickable link to view the video on the main app.
 * Auto-hides with the same behavior as the title overlay.
 *
 * Features:
 * - Opens full video page in new tab
 * - Auto-hides after 3 seconds during playback
 * - Reappears on hover/pause
 * - SVG logo with purple gradient
 * - Respects branding=0 to disable
 * - Mobile responsive
 */

export class BrandingLink {
  /**
   * Generate full Nostube URL for video
   * @param {string} videoId - Original video identifier (nevent/naddr/note)
   * @returns {string} Full Nostube URL
   */
  static generateVideoUrl(videoId) {
    // Base URL for Nostube video pages
    const baseUrl = 'https://nostu.be/video'
    return `${baseUrl}/${videoId}`
  }

  /**
   * Create Nostube logo SVG
   * @returns {SVGElement} Nostube logo
   */
  static createLogoSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'branding-logo')
    svg.setAttribute('viewBox', '0 0 72 72')
    svg.setAttribute('width', '32')
    svg.setAttribute('height', '32')

    // Create gradient definition
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const linearGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    linearGradient.setAttribute('id', 'logo-gradient')
    linearGradient.setAttribute('x1', '0%')
    linearGradient.setAttribute('y1', '0%')
    linearGradient.setAttribute('x2', '100%')
    linearGradient.setAttribute('y2', '100%')

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
    stop1.setAttribute('offset', '0%')
    stop1.setAttribute('style', 'stop-color:#9e51ff;stop-opacity:1')

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
    stop2.setAttribute('offset', '50%')
    stop2.setAttribute('style', 'stop-color:#8e51ff;stop-opacity:1')

    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
    stop3.setAttribute('offset', '100%')
    stop3.setAttribute('style', 'stop-color:#7524ff;stop-opacity:1')

    linearGradient.appendChild(stop1)
    linearGradient.appendChild(stop2)
    linearGradient.appendChild(stop3)
    defs.appendChild(linearGradient)
    svg.appendChild(defs)

    // Circle background
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', '36')
    circle.setAttribute('cy', '36')
    circle.setAttribute('r', '36')
    circle.setAttribute('fill', 'url(#logo-gradient)')

    // Play button triangle
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M 28 22 L 28 50 L 50 36 Z')
    path.setAttribute('fill', '#ffffff')

    svg.appendChild(circle)
    svg.appendChild(path)

    return svg
  }

  /**
   * Create branding link element
   * @param {string} videoId - Video identifier
   * @returns {HTMLElement} Branding link element
   */
  static createLink(videoId) {
    // Create anchor element
    const link = document.createElement('a')
    link.className = 'branding-link'
    link.href = BrandingLink.generateVideoUrl(videoId)
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.setAttribute('aria-label', 'Watch on Nostube')

    // Add logo SVG
    const logo = BrandingLink.createLogoSvg()
    link.appendChild(logo)

    return link
  }

  /**
   * Show branding with fade-in animation
   * @param {HTMLElement} branding - Branding element
   */
  static show(branding) {
    branding.classList.remove('hidden')
  }

  /**
   * Hide branding with fade-out animation
   * @param {HTMLElement} branding - Branding element
   */
  static hide(branding) {
    branding.classList.add('hidden')
  }

  /**
   * Apply branding link to video player with auto-hide behavior
   * @param {HTMLElement} container - Player container element
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {string} videoId - Video identifier
   * @param {Object} params - URL parameters from parseURLParams()
   */
  static applyToPlayer(container, videoElement, videoId, params) {
    // Check if branding should be shown
    if (!params.showBranding) {
      console.log('[BrandingLink] Branding link disabled via branding=0 parameter')
      return
    }

    console.log('[BrandingLink] Applying branding link')

    // Create branding link
    const brandingLink = BrandingLink.createLink(videoId)

    // Add to container
    container.appendChild(brandingLink)

    // Auto-hide timer
    let hideTimer = null

    // Start initial auto-hide timer (3 seconds)
    const startAutoHideTimer = () => {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        if (!videoElement.paused) {
          BrandingLink.hide(brandingLink)
        }
      }, 3000)
    }

    // Show branding on hover
    container.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer)
      BrandingLink.show(brandingLink)
    })

    // Hide branding on mouse leave (if playing)
    container.addEventListener('mouseleave', () => {
      if (!videoElement.paused) {
        BrandingLink.hide(brandingLink)
      }
    })

    // Show branding on pause
    videoElement.addEventListener('pause', () => {
      clearTimeout(hideTimer)
      BrandingLink.show(brandingLink)
    })

    // Hide branding on play
    videoElement.addEventListener('play', () => {
      clearTimeout(hideTimer)
      BrandingLink.hide(brandingLink)
    })

    // Start initial auto-hide timer
    startAutoHideTimer()

    console.log('[BrandingLink] Branding link applied successfully')
  }
}

/**
 * Parse URL query parameters into config object
 * @returns {Object} Configuration from URL parameters
 */
export function parseURLParams() {
  const params = new URLSearchParams(window.location.search)

  return {
    // Required
    videoId: params.get('v') || '',

    // Playback options
    autoplay: params.get('autoplay') === '1',
    muted: params.get('muted') === '1',
    loop: params.get('loop') === '1',
    startTime: parseInt(params.get('t') || '0', 10),

    // UI options
    controls: params.get('controls') !== '0', // Default true
    showTitle: params.get('title') !== '0', // Default true
    showBranding: params.get('branding') !== '0', // Default true

    // Quality and relay options
    preferredQuality: params.get('quality') || 'auto',
    customRelays: params.get('relays')
      ? params
          .get('relays')
          .split(',')
          .map(r => r.trim())
      : [],

    // Styling
    accentColor: params.get('color') || '8b5cf6',
  }
}

/**
 * Validate required parameters
 * @param {Object} config - Parsed configuration
 * @returns {{valid: boolean, error?: string}}
 */
export function validateParams(config) {
  if (!config.videoId) {
    return { valid: false, error: 'Missing required parameter: v (video ID)' }
  }

  // Basic validation that it looks like a nostr identifier
  if (
    !config.videoId.startsWith('nevent1') &&
    !config.videoId.startsWith('naddr1') &&
    !config.videoId.startsWith('note1')
  ) {
    return {
      valid: false,
      error: 'Invalid video ID format. Must be nevent1..., naddr1..., or note1...',
    }
  }

  return { valid: true }
}

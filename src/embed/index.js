import { parseURLParams, validateParams } from './url-params.js'
import { decodeVideoIdentifier, buildRelayList } from './nostr-decoder.js'
import { NostrClient } from './nostr-client.js'

let client = null

// Main entry point
async function initPlayer() {
  console.log('[Nostube Embed] Initializing player...')

  try {
    // Parse and validate URL parameters
    const config = parseURLParams()
    const validation = validateParams(config)

    if (!validation.valid) {
      showError(validation.error)
      return
    }

    // Show loading state
    showLoading('Loading video...')

    // Decode video identifier
    const decoded = decodeVideoIdentifier(config.videoId)
    if (!decoded) {
      showError('Failed to decode video identifier')
      return
    }

    console.log('[Nostube Embed] Decoded:', decoded)

    // Build relay list
    const relays = buildRelayList(decoded.data.relays, config.customRelays)
    console.log('[Nostube Embed] Relays:', relays)

    // Fetch event from relays
    client = new NostrClient(relays)
    const event = await client.fetchEvent(decoded)

    console.log('[Nostube Embed] Event fetched:', event)

    // TODO: Parse event and build player
    showSuccess('Event fetched successfully! (Next: parse and render player)')

  } catch (error) {
    console.error('[Nostube Embed] Error:', error)
    showError(error.message)
  }
}

// Loading state
function showLoading(message) {
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px; animation: spin 1s linear infinite;">
          ⏳
        </div>
        <div style="font-size: 14px; color: #999;">${message}</div>
      </div>
    </div>
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `
}

// Success state (temporary)
function showSuccess(message) {
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
        <div style="font-size: 14px; color: #999;">${message}</div>
      </div>
    </div>
  `
}

// Error state
function showError(message) {
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Error</div>
        <div style="font-size: 14px; color: #999;">${message}</div>
      </div>
    </div>
  `
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (client) {
    client.closeAll()
  }
})

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlayer)
} else {
  initPlayer()
}

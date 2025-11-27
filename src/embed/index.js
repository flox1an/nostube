import { parseURLParams, validateParams } from './url-params.js'
import { decodeVideoIdentifier, buildRelayList } from './nostr-decoder.js'
import { NostrClient } from './nostr-client.js'
import { parseVideoEvent, selectVideoVariant } from './video-parser.js'
import { PlayerUI } from './player-ui.js'
import { ContentWarning } from './content-warning.js'
import { TitleOverlay } from './title-overlay.js'

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

    // Build relay list and fetch event
    const relays = buildRelayList(decoded.data.relays, config.customRelays)
    client = new NostrClient(relays)
    const event = await client.fetchEvent(decoded)

    // Parse video metadata
    const video = parseVideoEvent(event)
    console.log('[Nostube Embed] Parsed video:', video)

    // Select video variant based on quality preference
    const selectedVariant = selectVideoVariant(video.videoVariants, config.preferredQuality)
    if (!selectedVariant) {
      showError('No video URLs found in event')
      return
    }

    console.log('[Nostube Embed] Selected variant:', selectedVariant)

    // Build and render video player
    try {
      const videoElement = PlayerUI.buildVideoPlayer(video, config)
      const container = PlayerUI.createPlayerContainer(videoElement)

      // Apply content warning overlay if video has sensitive content
      ContentWarning.applyToPlayer(container, videoElement, video)

      // Apply title overlay if enabled
      TitleOverlay.applyToPlayer(container, videoElement, video, config)

      // Clear loading state and show player
      document.body.innerHTML = ''
      document.body.appendChild(container)

      // Optional: Log when video is ready
      videoElement.addEventListener(
        'canplay',
        () => {
          console.log('[Nostube Embed] Player ready')
        },
        { once: true }
      )
    } catch (playerError) {
      console.error('[Nostube Embed] Player error:', playerError)
      showError(`Failed to initialize player: ${playerError.message}`)
      return
    }
  } catch (error) {
    console.error('[Nostube Embed] Error:', error)
    if (error.message.includes('timeout')) {
      showError('Connection failed. Unable to fetch video.')
    } else if (error.message.includes('not found')) {
      showError('Video not found')
    } else {
      showError(error.message)
    }
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

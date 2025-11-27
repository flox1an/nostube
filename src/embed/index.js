import { parseURLParams, validateParams } from './url-params.js'

// Main entry point
async function initPlayer() {
  console.log('[Nostube Embed] Initializing player...')

  // Parse and validate URL parameters
  const config = parseURLParams()
  const validation = validateParams(config)

  if (!validation.valid) {
    console.error('[Nostube Embed] Invalid configuration:', validation.error)
    showError(validation.error)
    return
  }

  console.log('[Nostube Embed] Configuration:', config)

  // TODO: Continue initialization
}

// Temporary error display function
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

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlayer)
} else {
  initPlayer()
}

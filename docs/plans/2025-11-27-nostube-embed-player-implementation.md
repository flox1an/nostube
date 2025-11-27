# Nostube Embeddable Video Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use @superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone embeddable video player for Nostr videos that can be embedded via iframe on any website.

**Architecture:** Vanilla JavaScript player with nostr-tools bundled, living in `public/` folder as self-contained files. Uses esbuild for bundling, native HTML5 video controls, and smart relay selection for fetching Nostr video events.

**Tech Stack:** Vanilla JS, nostr-tools, esbuild, HTML5 video, CSS3, native WebSocket

---

## Phase 1: Infrastructure Setup

### Task 1: Create Directory Structure

**Files:**

- Create: `src/embed/index.js`
- Create: `scripts/build-embed.js`

**Step 1: Create embed source directory**

```bash
mkdir -p src/embed
touch src/embed/index.js
```

**Step 2: Create build script**

```bash
mkdir -p scripts
```

Create `scripts/build-embed.js`:

```javascript
import esbuild from 'esbuild'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

const isDev = process.argv.includes('--watch')

const config = {
  entryPoints: ['src/embed/index.js'],
  bundle: true,
  minify: !isDev,
  target: 'es2020',
  format: 'iife',
  outfile: 'public/nostube-embed.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    'process.env.VERSION': `"${packageJson.version}"`,
  },
  banner: {
    js: `/* Nostube Embed Player v${packageJson.version} | https://nostube.com */`,
  },
  sourcemap: isDev,
}

if (isDev) {
  const ctx = await esbuild.context(config)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(config)
  console.log('Build complete!')
}
```

**Step 3: Add esbuild dependency**

```bash
npm install --save-dev esbuild
```

Expected: esbuild installed successfully

**Step 4: Add build script to package.json**

Modify `package.json`:

```json
"scripts": {
  "dev": "npm i && vite",
  "typecheck": "tsc -p tsconfig.app.json --noEmit",
  "build": "tsc -p tsconfig.app.json --noEmit && eslint && vite build && cp dist/index.html dist/404.html",
  "build:embed": "node scripts/build-embed.js",
  "build:embed:watch": "node scripts/build-embed.js --watch",
  "start": "vite preview --port 8080 --host ::",
  ...
}
```

**Step 5: Test build script**

```bash
npm run build:embed
```

Expected: `public/nostube-embed.js` created (empty but valid)

**Step 6: Commit**

```bash
git add src/embed/ scripts/build-embed.js package.json
git commit -m "chore: add embed player build infrastructure

- Created src/embed/ directory for embed source
- Added esbuild-based build script for bundling
- Added npm run build:embed command
- Outputs to public/nostube-embed.js"
```

---

### Task 2: Create URL Parameter Parser

**Files:**

- Create: `src/embed/url-params.js`
- Modify: `src/embed/index.js`

**Step 1: Write parameter parser**

Create `src/embed/url-params.js`:

```javascript
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
```

**Step 2: Update index.js to use parameter parser**

Modify `src/embed/index.js`:

```javascript
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
```

**Step 3: Build and verify**

```bash
npm run build:embed
```

Expected: Build succeeds, `public/nostube-embed.js` updated

**Step 4: Create minimal test HTML**

Create `public/embed-test.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Nostube Embed Test</title>
    <style>
      body {
        margin: 0;
        padding: 0;
      }
      iframe {
        width: 100%;
        height: 600px;
        border: none;
      }
    </style>
  </head>
  <body>
    <h1 style="padding: 20px; font-family: system-ui;">Nostube Embed Test</h1>
    <iframe
      src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
    ></iframe>
  </body>
</html>
```

Create `public/embed-demo.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nostube Embed Player</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <script src="nostube-embed.js"></script>
  </body>
</html>
```

**Step 5: Test parameter parsing**

```bash
# Start dev server
npm run dev
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected: Error message "Missing required parameter: v (video ID)" shows (correct behavior)

Change iframe src to include video ID:

```html
<iframe
  src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
></iframe>
```

Expected: Console shows "Configuration: {videoId: 'nevent1...', ...}"

**Step 6: Commit**

```bash
git add src/embed/url-params.js src/embed/index.js public/embed-test.html public/embed-demo.html
git commit -m "feat: add URL parameter parsing for embed player

- Parse all embed parameters (v, autoplay, muted, etc.)
- Validate required video ID parameter
- Add temporary error display
- Add basic test HTML files"
```

---

## Phase 2: Nostr Integration

### Task 3: Implement NIP-19 Decoder

**Files:**

- Create: `src/embed/nostr-decoder.js`

**Step 1: Create decoder module**

Create `src/embed/nostr-decoder.js`:

```javascript
import { nip19 } from 'nostr-tools'

/**
 * Decode a NIP-19 identifier (nevent, naddr, note)
 * @param {string} identifier - NIP-19 encoded string
 * @returns {{type: string, data: Object} | null}
 */
export function decodeVideoIdentifier(identifier) {
  try {
    const decoded = nip19.decode(identifier)

    if (decoded.type === 'nevent') {
      // Regular event: {id, relays}
      return {
        type: 'event',
        data: {
          id: decoded.data.id,
          relays: decoded.data.relays || [],
        },
      }
    }

    if (decoded.type === 'note') {
      // Note: just event ID
      return {
        type: 'event',
        data: {
          id: decoded.data,
          relays: [],
        },
      }
    }

    if (decoded.type === 'naddr') {
      // Addressable event: {kind, pubkey, identifier, relays}
      return {
        type: 'address',
        data: {
          kind: decoded.data.kind,
          pubkey: decoded.data.pubkey,
          identifier: decoded.data.identifier,
          relays: decoded.data.relays || [],
        },
      }
    }

    return null
  } catch (error) {
    console.error('[Nostr Decoder] Failed to decode identifier:', error)
    return null
  }
}

/**
 * Get default relay list
 * @returns {string[]}
 */
export function getDefaultRelays() {
  return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
}

/**
 * Build final relay list with priorities
 * @param {string[]} hintRelays - Relays from nevent/naddr
 * @param {string[]} customRelays - Custom relays from URL param
 * @returns {string[]}
 */
export function buildRelayList(hintRelays = [], customRelays = []) {
  const relays = [...customRelays, ...hintRelays, ...getDefaultRelays()]

  // Remove duplicates while preserving order
  return [...new Set(relays)]
}
```

**Step 2: Test decoder with sample IDs**

Modify `src/embed/index.js` to test decoding:

```javascript
import { parseURLParams, validateParams } from './url-params.js'
import { decodeVideoIdentifier, buildRelayList } from './nostr-decoder.js'

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

  // Decode video identifier
  const decoded = decodeVideoIdentifier(config.videoId)
  if (!decoded) {
    showError('Failed to decode video identifier')
    return
  }

  console.log('[Nostube Embed] Decoded identifier:', decoded)

  // Build relay list
  const relays = buildRelayList(decoded.data.relays, config.customRelays)
  console.log('[Nostube Embed] Using relays:', relays)

  // TODO: Connect to relays and fetch event
}

// ... rest of code
```

**Step 3: Build and test**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected console output:

```
[Nostube Embed] Configuration: {videoId: 'nevent1...', ...}
[Nostube Embed] Decoded identifier: {type: 'event', data: {id: '...', relays: [...]}}
[Nostube Embed] Using relays: ['wss://relay.divine.video', ...]
```

**Step 4: Commit**

```bash
git add src/embed/nostr-decoder.js src/embed/index.js
git commit -m "feat: add NIP-19 identifier decoding

- Decode nevent, naddr, and note identifiers
- Extract relay hints from identifiers
- Build prioritized relay list (custom > hints > defaults)
- Support both regular and addressable events"
```

---

### Task 4: Implement Relay Connection and Event Fetching

**Files:**

- Create: `src/embed/nostr-client.js`

**Step 1: Create NostrClient class**

Create `src/embed/nostr-client.js`:

```javascript
/**
 * Simple Nostr relay client for fetching video events
 */
export class NostrClient {
  constructor(relays) {
    this.relays = relays
    this.connections = new Map()
    this.subscriptions = new Map()
  }

  /**
   * Connect to a single relay
   * @param {string} url - Relay WebSocket URL
   * @returns {Promise<WebSocket>}
   */
  async connectRelay(url) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout: ${url}`))
      }, 10000) // 10 second timeout

      try {
        const ws = new WebSocket(url)

        ws.onopen = () => {
          clearTimeout(timeout)
          console.log(`[Nostr Client] Connected to ${url}`)
          this.connections.set(url, ws)
          resolve(ws)
        }

        ws.onerror = error => {
          clearTimeout(timeout)
          console.error(`[Nostr Client] Connection error ${url}:`, error)
          reject(error)
        }

        ws.onclose = () => {
          console.log(`[Nostr Client] Disconnected from ${url}`)
          this.connections.delete(url)
        }
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  /**
   * Fetch a video event by ID or address
   * @param {Object} identifier - Decoded identifier {type, data}
   * @returns {Promise<Object>} - Nostr event
   */
  async fetchEvent(identifier) {
    const subId = `embed-${Date.now()}`

    // Build filter based on identifier type
    let filter
    if (identifier.type === 'event') {
      filter = { ids: [identifier.data.id] }
    } else if (identifier.type === 'address') {
      filter = {
        kinds: [identifier.data.kind],
        authors: [identifier.data.pubkey],
        '#d': [identifier.data.identifier],
      }
    } else {
      throw new Error('Invalid identifier type')
    }

    console.log('[Nostr Client] Fetching event with filter:', filter)

    // Connect to all relays in parallel
    const connectionPromises = this.relays.map(url =>
      this.connectRelay(url).catch(err => {
        console.warn(`[Nostr Client] Failed to connect to ${url}:`, err.message)
        return null
      })
    )

    const connections = (await Promise.all(connectionPromises)).filter(Boolean)

    if (connections.length === 0) {
      throw new Error('Failed to connect to any relay')
    }

    console.log(`[Nostr Client] Connected to ${connections.length}/${this.relays.length} relays`)

    // Subscribe and wait for event
    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.closeSubscription(subId)
          reject(new Error('Event not found (timeout)'))
        }
      }, 10000) // 10 second timeout for event fetch

      // Subscribe to each connection
      connections.forEach(ws => {
        // Handle messages
        const messageHandler = event => {
          try {
            const message = JSON.parse(event.data)

            // Handle EVENT messages
            if (message[0] === 'EVENT' && message[1] === subId) {
              if (!resolved) {
                resolved = true
                clearTimeout(timeout)
                const nostrEvent = message[2]
                console.log('[Nostr Client] Event received:', nostrEvent)
                this.closeSubscription(subId)
                resolve(nostrEvent)
              }
            }

            // Handle EOSE (end of stored events)
            if (message[0] === 'EOSE' && message[1] === subId) {
              console.log(`[Nostr Client] EOSE received from relay`)
            }
          } catch (error) {
            console.error('[Nostr Client] Failed to parse message:', error)
          }
        }

        ws.addEventListener('message', messageHandler)

        // Store subscription info for cleanup
        if (!this.subscriptions.has(subId)) {
          this.subscriptions.set(subId, [])
        }
        this.subscriptions.get(subId).push({
          ws,
          handler: messageHandler,
        })

        // Send REQ message
        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
        console.log(`[Nostr Client] Sent REQ to relay:`, reqMessage)
      })
    })
  }

  /**
   * Close subscription and clean up
   * @param {string} subId - Subscription ID
   */
  closeSubscription(subId) {
    const subs = this.subscriptions.get(subId)
    if (!subs) return

    // Send CLOSE message and remove event listeners
    subs.forEach(({ ws, handler }) => {
      try {
        ws.send(JSON.stringify(['CLOSE', subId]))
        ws.removeEventListener('message', handler)
      } catch (error) {
        // Ignore errors during cleanup
      }
    })

    this.subscriptions.delete(subId)
    console.log(`[Nostr Client] Closed subscription ${subId}`)
  }

  /**
   * Close all connections
   */
  closeAll() {
    // Close all subscriptions
    this.subscriptions.forEach((_, subId) => {
      this.closeSubscription(subId)
    })

    // Close all WebSocket connections
    this.connections.forEach((ws, url) => {
      try {
        ws.close()
      } catch (error) {
        // Ignore errors during cleanup
      }
    })

    this.connections.clear()
    console.log('[Nostr Client] All connections closed')
  }
}
```

**Step 2: Integrate NostrClient into main flow**

Modify `src/embed/index.js`:

```javascript
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
```

**Step 3: Build and test with real event**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected:

1. Shows "Loading video..." with spinning icon
2. Console shows relay connections
3. Console shows "Event fetched: {kind: 34235, ...}"
4. Shows "Event fetched successfully!" message

**Step 4: Commit**

```bash
git add src/embed/nostr-client.js src/embed/index.js
git commit -m "feat: add Nostr relay client for event fetching

- Connect to multiple relays in parallel
- Subscribe with REQ and wait for EVENT response
- Handle EOSE and connection errors
- 10 second timeout for connections and fetches
- Clean up subscriptions and connections on exit"
```

---

### Task 5: Parse Video Event Into Metadata

**Files:**

- Create: `src/embed/video-parser.js`

**Step 1: Create video event parser**

Create `src/embed/video-parser.js`:

```javascript
/**
 * Parse a Nostr video event into usable metadata
 * Supports kinds 21, 22, 34235, 34236 (NIP-71)
 * @param {Object} event - Nostr event
 * @returns {Object} Parsed video metadata
 */
export function parseVideoEvent(event) {
  // Find imeta tags (NIP-92)
  const imetaTags = event.tags.filter(t => t[0] === 'imeta')

  if (imetaTags.length > 0) {
    return parseImetaFormat(event, imetaTags)
  } else {
    return parseLegacyFormat(event)
  }
}

/**
 * Parse event with imeta tags (new format)
 */
function parseImetaFormat(event, imetaTags) {
  const allVariants = imetaTags.map(tag => parseImetaTag(tag)).filter(Boolean)

  // Separate videos and thumbnails
  const videoVariants = allVariants.filter(v => v.mimeType?.startsWith('video/'))
  const thumbnails = allVariants.filter(v => v.mimeType?.startsWith('image/'))

  // Also collect image URLs from standalone image fields in imeta
  imetaTags.forEach(tag => {
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i]
      if (part.startsWith('image ')) {
        const imageUrl = part.substring(6).trim()
        if (imageUrl && !thumbnails.some(t => t.url === imageUrl)) {
          thumbnails.push({ url: imageUrl, fallbackUrls: [] })
        }
      }
    }
  })

  // Sort videos by quality (highest first)
  videoVariants.sort((a, b) => {
    const qA = extractNumericQuality(a)
    const qB = extractNumericQuality(b)
    return qB - qA
  })

  // Extract other metadata
  const title =
    event.tags.find(t => t[0] === 'title')?.[1] ||
    event.tags.find(t => t[0] === 'alt')?.[1] ||
    event.content ||
    'Untitled Video'

  const description = event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]
  const author = event.pubkey

  return {
    id: event.id,
    kind: event.kind,
    title,
    description,
    author,
    createdAt: event.created_at,
    duration,
    contentWarning,
    videoVariants,
    thumbnails,
  }
}

/**
 * Parse event with legacy url/m/thumb tags (old format)
 */
function parseLegacyFormat(event) {
  const url = event.tags.find(t => t[0] === 'url')?.[1] || ''
  const mimeType = event.tags.find(t => t[0] === 'm')?.[1] || 'video/mp4'
  const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || ''
  const title = event.tags.find(t => t[0] === 'title')?.[1] || event.content || 'Untitled Video'
  const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]
  const dimensions = event.tags.find(t => t[0] === 'dim')?.[1]

  const videoVariants = url
    ? [
        {
          url,
          mimeType,
          dimensions,
          fallbackUrls: [],
        },
      ]
    : []

  const thumbnails = thumb
    ? [
        {
          url: thumb,
          fallbackUrls: [],
        },
      ]
    : []

  return {
    id: event.id,
    kind: event.kind,
    title,
    description,
    author: event.pubkey,
    createdAt: event.created_at,
    duration,
    contentWarning,
    videoVariants,
    thumbnails,
  }
}

/**
 * Parse a single imeta tag
 * Format: ["imeta", "url <url>", "m <mime>", "dim <WxH>", ...]
 */
function parseImetaTag(imetaTag) {
  const data = {}

  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i]
    const spaceIndex = part.indexOf(' ')

    if (spaceIndex === -1) continue

    const key = part.substring(0, spaceIndex)
    const value = part.substring(spaceIndex + 1).trim()

    if (key === 'url') {
      data.url = value
    } else if (key === 'm') {
      data.mimeType = value
    } else if (key === 'dim') {
      data.dimensions = value
    } else if (key === 'size') {
      data.size = parseInt(value, 10)
    } else if (key === 'x') {
      data.hash = value
    } else if (key === 'fallback' || key === 'mirror') {
      if (!data.fallbackUrls) data.fallbackUrls = []
      data.fallbackUrls.push(value)
    }
  }

  if (!data.url) return null
  if (!data.fallbackUrls) data.fallbackUrls = []

  return data
}

/**
 * Extract numeric quality from variant (for sorting)
 */
function extractNumericQuality(variant) {
  if (variant.dimensions) {
    const match = variant.dimensions.match(/x(\d+)/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

/**
 * Select best video variant based on quality preference
 * @param {Array} variants - Video variants
 * @param {string} preferredQuality - 'auto', '1080p', '720p', etc.
 * @returns {Object} Selected variant
 */
export function selectVideoVariant(variants, preferredQuality = 'auto') {
  if (!variants || variants.length === 0) {
    return null
  }

  // Auto: return highest quality (first one, already sorted)
  if (preferredQuality === 'auto') {
    return variants[0]
  }

  // Extract target quality number (e.g., "1080p" -> 1080)
  const targetQuality = parseInt(preferredQuality, 10)
  if (isNaN(targetQuality)) {
    return variants[0]
  }

  // Find exact match or closest
  let bestMatch = variants[0]
  let bestDiff = Math.abs(extractNumericQuality(bestMatch) - targetQuality)

  for (const variant of variants) {
    const quality = extractNumericQuality(variant)
    const diff = Math.abs(quality - targetQuality)
    if (diff < bestDiff) {
      bestMatch = variant
      bestDiff = diff
    }
  }

  return bestMatch
}
```

**Step 2: Integrate parser into main flow**

Modify `src/embed/index.js`:

```javascript
import { parseURLParams, validateParams } from './url-params.js'
import { decodeVideoIdentifier, buildRelayList } from './nostr-decoder.js'
import { NostrClient } from './nostr-client.js'
import { parseVideoEvent, selectVideoVariant } from './video-parser.js'

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

    // TODO: Render video player
    showSuccess(`Video parsed! Title: "${video.title}"`)
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

// ... rest of code (showLoading, showError, etc.)
```

**Step 3: Build and test**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected console output:

```
[Nostube Embed] Parsed video: {
  id: '...',
  title: '...',
  videoVariants: [...],
  thumbnails: [...],
  ...
}
[Nostube Embed] Selected variant: {url: '...', mimeType: 'video/mp4', ...}
```

Expected UI: Shows "Video parsed! Title: ..." message

**Step 4: Commit**

```bash
git add src/embed/video-parser.js src/embed/index.js
git commit -m "feat: add video event parser with quality selection

- Parse imeta tags (NIP-92) and legacy url/m/thumb format
- Extract video variants and thumbnails
- Sort videos by quality (highest first)
- Select best variant based on quality preference
- Support kinds 21, 22, 34235, 34236"
```

---

## Phase 3: Video Player UI

### Task 6: Build Video Player DOM

**Files:**

- Create: `src/embed/player-ui.js`
- Create: `public/nostube-embed.css`

**Step 1: Create player UI module**

Create `src/embed/player-ui.js`:

```javascript
/**
 * Build and render the video player UI
 */
export class PlayerUI {
  constructor(container, video, config) {
    this.container = container
    this.video = video
    this.config = config
    this.videoElement = null
  }

  /**
   * Render the complete player
   */
  render() {
    // Clear container
    this.container.innerHTML = ''

    // Create main player wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'nostube-player'
    wrapper.id = 'nostube-player'

    // Build video element
    const videoEl = this.buildVideoElement()
    wrapper.appendChild(videoEl)

    // Add to container
    this.container.appendChild(wrapper)

    // Store reference
    this.videoElement = videoEl

    return this
  }

  /**
   * Build HTML5 video element
   */
  buildVideoElement() {
    const video = document.createElement('video')
    video.id = 'nostube-video'
    video.className = 'nostube-video'

    // Set attributes from config
    if (this.config.controls) {
      video.controls = true
    }

    if (this.config.autoplay) {
      video.autoplay = true
    }

    if (this.config.muted) {
      video.muted = true
    }

    if (this.config.loop) {
      video.loop = true
    }

    // Add poster (thumbnail) if available
    if (this.video.thumbnails && this.video.thumbnails.length > 0) {
      video.poster = this.video.thumbnails[0].url
    }

    // Add video sources
    this.addVideoSources(video)

    // Set current time if start time specified
    if (this.config.startTime > 0) {
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = this.config.startTime
        },
        { once: true }
      )
    }

    return video
  }

  /**
   * Add video source elements
   */
  addVideoSources(videoEl) {
    const variants = this.video.videoVariants

    if (!variants || variants.length === 0) {
      console.error('[Player UI] No video variants available')
      return
    }

    // Add all video URLs as sources (browser will try in order)
    variants.forEach((variant, index) => {
      // Main URL
      const source = document.createElement('source')
      source.src = variant.url
      if (variant.mimeType) {
        source.type = variant.mimeType
      }
      videoEl.appendChild(source)

      // Fallback URLs
      if (variant.fallbackUrls && variant.fallbackUrls.length > 0) {
        variant.fallbackUrls.forEach(fallbackUrl => {
          const fallbackSource = document.createElement('source')
          fallbackSource.src = fallbackUrl
          if (variant.mimeType) {
            fallbackSource.type = variant.mimeType
          }
          videoEl.appendChild(fallbackSource)
        })
      }
    })

    // Error fallback text
    const errorText = document.createTextNode('Your browser does not support the video tag.')
    videoEl.appendChild(errorText)
  }

  /**
   * Get the video element
   */
  getVideoElement() {
    return this.videoElement
  }
}
```

**Step 2: Create CSS styles**

Create `public/nostube-embed.css`:

```css
/* Nostube Embed Player Styles */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.nostube-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nostube-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  background: #000;
}

/* Loading state */
.nostube-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #fff;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  z-index: 100;
}

.nostube-loading-spinner {
  font-size: 48px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.nostube-loading-text {
  margin-top: 16px;
  font-size: 14px;
  color: #999;
}

/* Error state */
.nostube-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #fff;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  text-align: center;
  padding: 20px;
  z-index: 100;
}

.nostube-error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.nostube-error-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.nostube-error-message {
  font-size: 14px;
  color: #999;
  margin-bottom: 16px;
}

.nostube-retry-button {
  padding: 10px 20px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.nostube-retry-button:hover {
  background: #7c3aed;
}
```

**Step 3: Integrate player UI into main flow**

Modify `src/embed/index.js`:

```javascript
import { parseURLParams, validateParams } from './url-params.js'
import { decodeVideoIdentifier, buildRelayList } from './nostr-decoder.js'
import { NostrClient } from './nostr-client.js'
import { parseVideoEvent, selectVideoVariant } from './video-parser.js'
import { PlayerUI } from './player-ui.js'

let client = null
let playerUI = null

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
    console.log('[Nostube Embed] Video:', video)

    // Validate video has URLs
    if (!video.videoVariants || video.videoVariants.length === 0) {
      showError('No video URLs found in event')
      return
    }

    // Render player
    playerUI = new PlayerUI(document.body, video, config)
    playerUI.render()

    console.log('[Nostube Embed] Player rendered successfully')
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
    <div class="nostube-loading">
      <div>
        <div class="nostube-loading-spinner">⏳</div>
        <div class="nostube-loading-text">${message}</div>
      </div>
    </div>
  `
}

// Error state
function showError(message) {
  document.body.innerHTML = `
    <div class="nostube-error">
      <div>
        <div class="nostube-error-icon">⚠️</div>
        <div class="nostube-error-title">Error</div>
        <div class="nostube-error-message">${message}</div>
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
```

**Step 4: Update embed-demo.html to include CSS**

Modify `public/embed-demo.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nostube Embed Player</title>
    <link rel="stylesheet" href="nostube-embed.css" />
  </head>
  <body>
    <script src="nostube-embed.js"></script>
  </body>
</html>
```

**Step 5: Build and test**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected:

1. Shows loading spinner
2. Fetches video from relays
3. Renders video player with native controls
4. Video is playable

**Step 6: Test with both example IDs**

Update `public/embed-test.html` to test both nevent and naddr:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Nostube Embed Test</title>
    <style>
      body {
        margin: 0;
        padding: 20px;
        font-family: system-ui;
      }
      h1 {
        margin-bottom: 20px;
      }
      .test-case {
        margin-bottom: 40px;
      }
      h2 {
        font-size: 16px;
        margin-bottom: 10px;
      }
      iframe {
        width: 100%;
        height: 400px;
        border: 1px solid #ccc;
      }
    </style>
  </head>
  <body>
    <h1>Nostube Embed Player Tests</h1>

    <div class="test-case">
      <h2>Test 1: Regular Event (nevent)</h2>
      <iframe
        src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
      ></iframe>
    </div>

    <div class="test-case">
      <h2>Test 2: Addressable Event (naddr)</h2>
      <iframe
        src="embed-demo.html?v=naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj"
      ></iframe>
    </div>

    <div class="test-case">
      <h2>Test 3: With Autoplay &amp; Muted</h2>
      <iframe
        src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&autoplay=1&muted=1"
        allow="autoplay"
      ></iframe>
    </div>
  </body>
</html>
```

**Step 7: Commit**

```bash
git add src/embed/player-ui.js src/embed/index.js public/nostube-embed.css public/embed-demo.html public/embed-test.html
git commit -m "feat: add video player UI with native HTML5 controls

- Build video element with multiple source fallbacks
- Support autoplay, muted, loop, start time parameters
- Add poster thumbnail from event
- Style with CSS for full-screen player
- Update test page with multiple test cases"
```

---

## Phase 4: UI Overlays

### Task 7: Add Content Warning Overlay

**Files:**

- Create: `src/embed/content-warning.js`
- Modify: `src/embed/index.js`
- Modify: `public/nostube-embed.css`

**Step 1: Create content warning module**

Create `src/embed/content-warning.js`:

```javascript
/**
 * Content warning overlay for sensitive content
 */
export class ContentWarningOverlay {
  constructor(playerContainer, video, config) {
    this.playerContainer = playerContainer
    this.video = video
    this.config = config
    this.overlayElement = null
  }

  /**
   * Check if content warning should be shown
   */
  shouldShow() {
    return Boolean(this.video.contentWarning)
  }

  /**
   * Render the content warning overlay
   */
  render() {
    if (!this.shouldShow()) {
      return null
    }

    const overlay = document.createElement('div')
    overlay.className = 'nostube-content-warning'
    overlay.id = 'nostube-content-warning'

    overlay.innerHTML = `
      <div class="nostube-content-warning-content">
        <div class="nostube-content-warning-icon">⚠️</div>
        <div class="nostube-content-warning-title">Sensitive Content</div>
        <div class="nostube-content-warning-message">${this.escapeHtml(this.video.contentWarning)}</div>
        <button class="nostube-content-warning-button">Click to reveal</button>
      </div>
    `

    // Add click handler to reveal
    overlay.addEventListener('click', () => this.reveal())

    this.overlayElement = overlay
    return overlay
  }

  /**
   * Reveal the video (remove overlay)
   */
  reveal() {
    if (this.overlayElement) {
      this.overlayElement.remove()
      this.overlayElement = null

      // Show controls on video
      const videoEl = document.getElementById('nostube-video')
      if (videoEl) {
        videoEl.controls = this.config.controls
      }
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}
```

**Step 2: Add content warning styles**

Add to `public/nostube-embed.css`:

```css
/* Content Warning Overlay */
.nostube-content-warning {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.nostube-content-warning:hover {
  opacity: 0.95;
}

.nostube-content-warning-content {
  text-align: center;
  padding: 20px;
  max-width: 400px;
}

.nostube-content-warning-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.nostube-content-warning-title {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 12px;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.nostube-content-warning-message {
  font-size: 16px;
  color: #ccc;
  margin-bottom: 24px;
  line-height: 1.5;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.nostube-content-warning-button {
  padding: 12px 24px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.nostube-content-warning-button:hover {
  background: #7c3aed;
  transform: scale(1.05);
}

/* Blurred poster when content warning is active */
.nostube-player.has-content-warning .nostube-video {
  filter: blur(20px);
}
```

**Step 3: Integrate into player**

Modify `src/embed/player-ui.js`:

```javascript
import { ContentWarningOverlay } from './content-warning.js'

/**
 * Build and render the video player UI
 */
export class PlayerUI {
  constructor(container, video, config) {
    this.container = container
    this.video = video
    this.config = config
    this.videoElement = null
    this.contentWarningOverlay = null
  }

  /**
   * Render the complete player
   */
  render() {
    // Clear container
    this.container.innerHTML = ''

    // Create main player wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'nostube-player'
    wrapper.id = 'nostube-player'

    // Build video element
    const videoEl = this.buildVideoElement()
    wrapper.appendChild(videoEl)

    // Add content warning overlay if needed
    this.contentWarningOverlay = new ContentWarningOverlay(wrapper, this.video, this.config)
    if (this.contentWarningOverlay.shouldShow()) {
      const overlay = this.contentWarningOverlay.render()
      if (overlay) {
        wrapper.appendChild(overlay)
        wrapper.classList.add('has-content-warning')

        // Hide controls initially when content warning is shown
        videoEl.controls = false
      }
    }

    // Add to container
    this.container.appendChild(wrapper)

    // Store reference
    this.videoElement = videoEl

    return this
  }

  // ... rest of methods unchanged
}
```

**Step 4: Build and test**

```bash
npm run build:embed
```

Test with a video that has content warning (if available). If not, can test by temporarily modifying the parser to add a fake warning:

Temporarily add to `src/embed/video-parser.js` in `parseImetaFormat` function:

```javascript
return {
  id: event.id,
  kind: event.kind,
  title,
  description,
  author,
  createdAt: event.created_at,
  duration,
  contentWarning: contentWarning || 'Test warning', // Add fake warning for testing
  videoVariants,
  thumbnails,
}
```

Rebuild and test:

Expected:

1. Shows blurred video with warning overlay
2. Click anywhere reveals the video
3. Controls appear after clicking

Remove test warning after verification.

**Step 5: Commit**

```bash
git add src/embed/content-warning.js src/embed/player-ui.js public/nostube-embed.css
git commit -m "feat: add content warning overlay for sensitive content

- Show blurred overlay with warning message
- Click to reveal functionality
- Hide controls until user reveals content
- Styled with backdrop blur and smooth transitions
- XSS-safe message rendering"
```

---

### Task 8: Add Title Overlay

**Files:**

- Create: `src/embed/title-overlay.js`
- Modify: `src/embed/player-ui.js`
- Modify: `public/nostube-embed.css`

**Step 1: Create title overlay module**

Create `src/embed/title-overlay.js`:

```javascript
/**
 * Title and author overlay for video player
 */
export class TitleOverlay {
  constructor(playerContainer, video, config) {
    this.playerContainer = playerContainer
    this.video = video
    this.config = config
    this.overlayElement = null
    this.hideTimeout = null
    this.videoElement = null
  }

  /**
   * Check if title should be shown
   */
  shouldShow() {
    return this.config.showTitle
  }

  /**
   * Render the title overlay
   */
  render(videoElement) {
    if (!this.shouldShow()) {
      return null
    }

    this.videoElement = videoElement

    const overlay = document.createElement('div')
    overlay.className = 'nostube-title-overlay'
    overlay.id = 'nostube-title-overlay'

    // Truncate title if too long
    const title = this.truncate(this.video.title, 80)

    // Format author (first 8 chars of pubkey)
    const author = this.video.author ? this.formatPubkey(this.video.author) : 'Unknown'

    overlay.innerHTML = `
      <div class="nostube-title-overlay-content">
        <div class="nostube-title-overlay-title">${this.escapeHtml(title)}</div>
        <div class="nostube-title-overlay-author">by ${this.escapeHtml(author)}</div>
      </div>
    `

    this.overlayElement = overlay

    // Set up auto-hide behavior
    this.setupAutoHide()

    return overlay
  }

  /**
   * Set up auto-hide and show-on-hover behavior
   */
  setupAutoHide() {
    if (!this.videoElement || !this.overlayElement) return

    // Hide after 3 seconds initially
    this.hideTimeout = setTimeout(() => this.hide(), 3000)

    // Show on hover
    this.playerContainer.addEventListener('mouseenter', () => this.show())
    this.playerContainer.addEventListener('mouseleave', () => this.scheduleHide())

    // Show when paused, hide when playing
    this.videoElement.addEventListener('pause', () => this.show())
    this.videoElement.addEventListener('play', () => this.scheduleHide())
  }

  /**
   * Show the overlay
   */
  show() {
    if (this.overlayElement) {
      this.overlayElement.classList.add('visible')
      this.overlayElement.classList.remove('hidden')
    }

    // Clear any pending hide
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }

  /**
   * Schedule hide after delay
   */
  scheduleHide() {
    // Clear any existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
    }

    // Only hide if video is playing
    if (this.videoElement && !this.videoElement.paused) {
      this.hideTimeout = setTimeout(() => this.hide(), 2000)
    }
  }

  /**
   * Hide the overlay
   */
  hide() {
    if (this.overlayElement) {
      this.overlayElement.classList.remove('visible')
      this.overlayElement.classList.add('hidden')
    }
  }

  /**
   * Truncate text to max length
   */
  truncate(text, maxLength) {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - 3) + '...'
  }

  /**
   * Format pubkey (show first 8 chars with npub prefix)
   */
  formatPubkey(pubkey) {
    if (pubkey.startsWith('npub1')) {
      return pubkey.substring(0, 12) + '...'
    }
    return 'npub1' + pubkey.substring(0, 8) + '...'
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}
```

**Step 2: Add title overlay styles**

Add to `public/nostube-embed.css`:

```css
/* Title Overlay */
.nostube-title-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 100%);
  z-index: 50;
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.3s ease;
}

.nostube-title-overlay.hidden {
  opacity: 0;
}

.nostube-title-overlay.visible {
  opacity: 1;
}

.nostube-title-overlay-content {
  max-width: 100%;
}

.nostube-title-overlay-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nostube-title-overlay-author {
  font-size: 14px;
  color: #ddd;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
```

**Step 3: Integrate into player**

Modify `src/embed/player-ui.js`:

```javascript
import { ContentWarningOverlay } from './content-warning.js'
import { TitleOverlay } from './title-overlay.js'

/**
 * Build and render the video player UI
 */
export class PlayerUI {
  constructor(container, video, config) {
    this.container = container
    this.video = video
    this.config = config
    this.videoElement = null
    this.contentWarningOverlay = null
    this.titleOverlay = null
  }

  /**
   * Render the complete player
   */
  render() {
    // Clear container
    this.container.innerHTML = ''

    // Create main player wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'nostube-player'
    wrapper.id = 'nostube-player'

    // Build video element
    const videoEl = this.buildVideoElement()
    wrapper.appendChild(videoEl)

    // Add title overlay
    this.titleOverlay = new TitleOverlay(wrapper, this.video, this.config)
    if (this.titleOverlay.shouldShow()) {
      const titleEl = this.titleOverlay.render(videoEl)
      if (titleEl) {
        wrapper.appendChild(titleEl)
      }
    }

    // Add content warning overlay if needed (should be on top)
    this.contentWarningOverlay = new ContentWarningOverlay(wrapper, this.video, this.config)
    if (this.contentWarningOverlay.shouldShow()) {
      const overlay = this.contentWarningOverlay.render()
      if (overlay) {
        wrapper.appendChild(overlay)
        wrapper.classList.add('has-content-warning')
        videoEl.controls = false
      }
    }

    // Add to container
    this.container.appendChild(wrapper)

    // Store reference
    this.videoElement = videoEl

    return this
  }

  // ... rest of methods unchanged
}
```

**Step 4: Build and test**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected behavior:

1. Title appears at top on load
2. Title fades out after 3 seconds
3. Title reappears on hover
4. Title shows when paused, hides when playing

Test `title=0` parameter:

```html
<iframe src="embed-demo.html?v=nevent1...&title=0"></iframe>
```

Expected: No title overlay shown

**Step 5: Commit**

```bash
git add src/embed/title-overlay.js src/embed/player-ui.js public/nostube-embed.css
git commit -m "feat: add title overlay with auto-hide behavior

- Show video title and author at top
- Fade out after 3 seconds
- Reappear on hover and when paused
- Hide during playback
- Respect title=0 parameter
- Gradient background for readability"
```

---

### Task 9: Add Branding Link

**Files:**

- Create: `src/embed/branding.js`
- Modify: `src/embed/player-ui.js`
- Modify: `public/nostube-embed.css`

**Step 1: Create branding module**

Create `src/embed/branding.js`:

```javascript
/**
 * "Watch on Nostube" branding link
 */
export class BrandingLink {
  constructor(playerContainer, video, config) {
    this.playerContainer = playerContainer
    this.video = video
    this.config = config
  }

  /**
   * Check if branding should be shown
   */
  shouldShow() {
    return this.config.showBranding
  }

  /**
   * Render the branding link
   */
  render() {
    if (!this.shouldShow()) {
      return null
    }

    const link = document.createElement('a')
    link.className = 'nostube-branding'
    link.id = 'nostube-branding'
    link.href = this.buildVideoUrl()
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Watch on Nostube'

    // Apply custom accent color if provided
    if (this.config.accentColor) {
      link.style.setProperty('--accent-color', `#${this.config.accentColor}`)
    }

    return link
  }

  /**
   * Build URL to video page on Nostube
   */
  buildVideoUrl() {
    // Use current origin or default to nostube.com
    const baseUrl = window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://nostube.com'

    return `${baseUrl}/video/${this.config.videoId}`
  }
}
```

**Step 2: Add branding styles**

Add to `public/nostube-embed.css`:

```css
/* Branding Link */
.nostube-branding {
  position: absolute;
  bottom: 60px; /* Above video controls */
  right: 16px;
  padding: 8px 14px;
  background: rgba(139, 92, 246, 0.9);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  text-decoration: none;
  border-radius: 6px;
  z-index: 60;
  opacity: 0.9;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.nostube-branding:hover {
  opacity: 1;
  background: var(--accent-color, #7c3aed);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

/* Adjust position when controls are hidden */
.nostube-player:not(.has-controls) .nostube-branding {
  bottom: 16px;
}
```

**Step 3: Integrate into player**

Modify `src/embed/player-ui.js`:

```javascript
import { ContentWarningOverlay } from './content-warning.js'
import { TitleOverlay } from './title-overlay.js'
import { BrandingLink } from './branding.js'

/**
 * Build and render the video player UI
 */
export class PlayerUI {
  constructor(container, video, config) {
    this.container = container
    this.video = video
    this.config = config
    this.videoElement = null
    this.contentWarningOverlay = null
    this.titleOverlay = null
    this.brandingLink = null
  }

  /**
   * Render the complete player
   */
  render() {
    // Clear container
    this.container.innerHTML = ''

    // Create main player wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'nostube-player'
    wrapper.id = 'nostube-player'

    // Add class if controls are enabled
    if (this.config.controls) {
      wrapper.classList.add('has-controls')
    }

    // Build video element
    const videoEl = this.buildVideoElement()
    wrapper.appendChild(videoEl)

    // Add title overlay
    this.titleOverlay = new TitleOverlay(wrapper, this.video, this.config)
    if (this.titleOverlay.shouldShow()) {
      const titleEl = this.titleOverlay.render(videoEl)
      if (titleEl) {
        wrapper.appendChild(titleEl)
      }
    }

    // Add branding link
    this.brandingLink = new BrandingLink(wrapper, this.video, this.config)
    if (this.brandingLink.shouldShow()) {
      const brandingEl = this.brandingLink.render()
      if (brandingEl) {
        wrapper.appendChild(brandingEl)
      }
    }

    // Add content warning overlay if needed (should be on top of everything)
    this.contentWarningOverlay = new ContentWarningOverlay(wrapper, this.video, this.config)
    if (this.contentWarningOverlay.shouldShow()) {
      const overlay = this.contentWarningOverlay.render()
      if (overlay) {
        wrapper.appendChild(overlay)
        wrapper.classList.add('has-content-warning')
        videoEl.controls = false
      }
    }

    // Add to container
    this.container.appendChild(wrapper)

    // Store reference
    this.videoElement = videoEl

    return this
  }

  // ... rest of methods unchanged
}
```

**Step 4: Build and test**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-test.html`

Expected:

1. "Watch on Nostube" link appears in bottom-right corner
2. Link is styled with purple background
3. Hover effect scales and changes color
4. Clicking opens video page on Nostube in new tab

Test with `branding=0`:

```html
<iframe src="embed-demo.html?v=nevent1...&branding=0"></iframe>
```

Expected: No branding link shown

Test with custom color:

```html
<iframe src="embed-demo.html?v=nevent1...&color=ff6b6b"></iframe>
```

Expected: Branding link uses red color on hover

**Step 5: Commit**

```bash
git add src/embed/branding.js src/embed/player-ui.js public/nostube-embed.css
git commit -m "feat: add branding link to video player

- \"Watch on Nostube\" link in bottom-right corner
- Opens video page in new tab
- Custom accent color support
- Hover effects and smooth transitions
- Respect branding=0 parameter
- Position adjusts based on controls visibility"
```

---

## Phase 5: Testing & Documentation

### Task 10: Create Comprehensive Example Page

**Files:**

- Create: `public/embed-example.html`

**Step 1: Create comprehensive example page**

Create `public/embed-example.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nostube Embed Player Examples</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        background: #f5f5f5;
        padding: 40px 20px;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
      }

      h1 {
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 12px;
        color: #111;
      }

      .subtitle {
        font-size: 16px;
        color: #666;
        margin-bottom: 40px;
      }

      .example {
        background: #fff;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 32px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .example h2 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 8px;
        color: #111;
      }

      .example p {
        font-size: 14px;
        color: #666;
        margin-bottom: 16px;
        line-height: 1.6;
      }

      .example iframe {
        width: 100%;
        height: 400px;
        border: none;
        border-radius: 8px;
        margin-bottom: 16px;
      }

      .example code {
        display: block;
        background: #f5f5f5;
        padding: 16px;
        border-radius: 6px;
        font-size: 13px;
        line-height: 1.6;
        overflow-x: auto;
        white-space: pre;
        color: #111;
        font-family: 'Courier New', monospace;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 24px;
        margin-top: 40px;
      }

      .grid .example iframe {
        height: 250px;
      }

      .note {
        background: #fffbeb;
        border-left: 4px solid #f59e0b;
        padding: 16px;
        margin-top: 16px;
        border-radius: 4px;
        font-size: 14px;
        color: #92400e;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Nostube Embed Player Examples</h1>
      <p class="subtitle">
        Interactive examples demonstrating all embed player features and parameters
      </p>

      <!-- Basic Example -->
      <div class="example">
        <h2>1. Basic Embed</h2>
        <p>Minimal embed with default settings. Just pass the video ID (nevent or naddr).</p>
        <iframe
          src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
        ></iframe>
        <code
          >&lt;iframe
          src="https://nostube.com/embed?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
          width="640" height="360" frameborder="0" allowfullscreen&gt; &lt;/iframe&gt;</code
        >
      </div>

      <!-- Addressable Event -->
      <div class="example">
        <h2>2. Addressable Event (naddr)</h2>
        <p>Embed using an addressable event identifier (NIP-33).</p>
        <iframe
          src="embed-demo.html?v=naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj"
        ></iframe>
        <code
          >&lt;iframe
          src="https://nostube.com/embed?v=naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj"
          width="640" height="360" frameborder="0" allowfullscreen&gt; &lt;/iframe&gt;</code
        >
      </div>

      <!-- Autoplay & Muted -->
      <div class="example">
        <h2>3. Autoplay & Muted</h2>
        <p>
          Video starts playing automatically when loaded. Note: Browsers require muted=1 for
          autoplay to work.
        </p>
        <iframe
          src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&autoplay=1&muted=1"
          allow="autoplay"
        >
        </iframe>
        <code
          >&lt;iframe src="https://nostube.com/embed?v=nevent1...&autoplay=1&muted=1" width="640"
          height="360" frameborder="0" allowfullscreen allow="autoplay"&gt; &lt;/iframe&gt;</code
        >
        <div class="note">
          <strong>Note:</strong> Most browsers require videos to be muted for autoplay to work.
          Always use <code>muted=1</code> with <code>autoplay=1</code>.
        </div>
      </div>

      <!-- Grid of smaller examples -->
      <h2 style="margin-top: 40px; margin-bottom: 20px;">More Examples</h2>

      <div class="grid">
        <!-- Loop -->
        <div class="example">
          <h2>4. Loop Video</h2>
          <p>Video loops continuously.</p>
          <iframe
            src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&loop=1&muted=1"
          ></iframe>
          <code>...?v=nevent1...&loop=1</code>
        </div>

        <!-- Start Time -->
        <div class="example">
          <h2>5. Start at Specific Time</h2>
          <p>Start video at 30 seconds.</p>
          <iframe
            src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&t=30"
          ></iframe>
          <code>...?v=nevent1...&t=30</code>
        </div>

        <!-- No Controls -->
        <div class="example">
          <h2>6. No Controls</h2>
          <p>Hide video controls.</p>
          <iframe
            src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&controls=0&autoplay=1&muted=1"
            allow="autoplay"
          ></iframe>
          <code>...?v=nevent1...&controls=0</code>
        </div>

        <!-- No Title -->
        <div class="example">
          <h2>7. No Title Overlay</h2>
          <p>Hide title and author overlay.</p>
          <iframe
            src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&title=0"
          ></iframe>
          <code>...?v=nevent1...&title=0</code>
        </div>

        <!-- No Branding -->
        <div class="example">
          <h2>8. No Branding</h2>
          <p>Hide "Watch on Nostube" link.</p>
          <iframe
            src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&branding=0"
          ></iframe>
          <code>...?v=nevent1...&branding=0</code>
        </div>

        <!-- Custom Color -->
        <div class="example">
          <h2>9. Custom Accent Color</h2>
          <p>Red branding color.</p>
          <iframe
            src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&color=ff6b6b"
          ></iframe>
          <code>...?v=nevent1...&color=ff6b6b</code>
        </div>
      </div>

      <!-- Parameters Reference -->
      <div class="example" style="margin-top: 40px;">
        <h2>URL Parameters Reference</h2>
        <p>All available parameters for customizing the embed player:</p>
        <code
          >v - Video ID (nevent/naddr/note) - REQUIRED autoplay - Auto-play on load (0/1, default:
          0) muted - Start muted (0/1, default: 0) loop - Loop playback (0/1, default: 0) t - Start
          time in seconds (number, default: 0) controls - Show/hide controls (0/1, default: 1) title
          - Show/hide title overlay (0/1, default: 1) quality - Preferred quality
          (auto/1080p/720p/480p, default: auto) relays - Custom relays (comma-separated URLs) color
          - Accent color (hex without #, default: 8b5cf6) branding - Show/hide branding link (0/1,
          default: 1)</code
        >
      </div>
    </div>
  </body>
</html>
```

**Step 2: Update embed-test.html reference**

Update `public/embed-test.html` to link to the new example page:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Nostube Embed Test</title>
    <style>
      body {
        margin: 0;
        padding: 20px;
        font-family: system-ui;
      }
      h1 {
        margin-bottom: 20px;
      }
      .links {
        margin-bottom: 30px;
      }
      .links a {
        display: inline-block;
        padding: 10px 16px;
        background: #8b5cf6;
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        margin-right: 10px;
        font-weight: 600;
      }
      .links a:hover {
        background: #7c3aed;
      }
      .test-case {
        margin-bottom: 40px;
      }
      h2 {
        font-size: 16px;
        margin-bottom: 10px;
      }
      iframe {
        width: 100%;
        height: 400px;
        border: 1px solid #ccc;
      }
    </style>
  </head>
  <body>
    <h1>Nostube Embed Player Tests</h1>

    <div class="links">
      <a href="embed-example.html" target="_blank">View All Examples →</a>
    </div>

    <div class="test-case">
      <h2>Test 1: Regular Event (nevent)</h2>
      <iframe
        src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
      ></iframe>
    </div>

    <div class="test-case">
      <h2>Test 2: Addressable Event (naddr)</h2>
      <iframe
        src="embed-demo.html?v=naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj"
      ></iframe>
    </div>

    <div class="test-case">
      <h2>Test 3: With Autoplay &amp; Muted</h2>
      <iframe
        src="embed-demo.html?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk&autoplay=1&muted=1"
        allow="autoplay"
      ></iframe>
    </div>
  </body>
</html>
```

**Step 3: Build and test**

```bash
npm run build:embed
```

Open browser to: `http://localhost:8080/embed-example.html`

Test all examples:

1. Basic embed works
2. naddr event works
3. Autoplay/muted works
4. Loop works
5. Start time works
6. No controls works
7. No title works
8. No branding works
9. Custom color works

**Step 4: Commit**

```bash
git add public/embed-example.html public/embed-test.html
git commit -m "docs: add comprehensive embed example page

- Interactive examples for all player features
- Code snippets for each example
- Parameters reference table
- Grid layout for smaller examples
- Link from test page to examples"
```

---

### Task 11: Write Embed Documentation (README)

**Files:**

- Create: `public/embed-README.md`

**Step 1: Write comprehensive README**

Create `public/embed-README.md`:

````markdown
# Nostube Embed Player

Embed Nostr videos on any website with a simple iframe.

## Quick Start

```html
<iframe
  src="https://nostube.com/embed?v=YOUR_VIDEO_ID"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```
````

Replace `YOUR_VIDEO_ID` with a video identifier (nevent, naddr, or note).

## Examples

See live examples at: [https://nostube.com/embed-example.html](https://nostube.com/embed-example.html)

### Basic Embed

```html
<iframe
  src="https://nostube.com/embed?v=nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```

### Autoplay (Muted)

Note: Browsers require muted for autoplay.

```html
<iframe
  src="https://nostube.com/embed?v=nevent1...&autoplay=1&muted=1"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay"
>
</iframe>
```

### Start at Specific Time

```html
<iframe
  src="https://nostube.com/embed?v=nevent1...&t=30"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```

### Custom Styling

```html
<iframe
  src="https://nostube.com/embed?v=nevent1...&color=ff6b6b&branding=0"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```

## URL Parameters

All parameters are optional except `v` (video ID).

| Parameter  | Type   | Default      | Description                              |
| ---------- | ------ | ------------ | ---------------------------------------- |
| `v`        | string | **required** | Video identifier (nevent/naddr/note)     |
| `autoplay` | 0/1    | 0            | Auto-play on load                        |
| `muted`    | 0/1    | 0            | Start muted                              |
| `loop`     | 0/1    | 0            | Loop playback                            |
| `t`        | number | 0            | Start time in seconds                    |
| `controls` | 0/1    | 1            | Show/hide video controls                 |
| `title`    | 0/1    | 1            | Show/hide title overlay                  |
| `quality`  | string | auto         | Preferred quality (auto/1080p/720p/480p) |
| `relays`   | string | auto         | Custom relay list (comma-separated)      |
| `color`    | hex    | 8b5cf6       | Accent color (without #)                 |
| `branding` | 0/1    | 1            | Show/hide "Watch on Nostube" link        |

## Video Identifiers

The embed player supports three types of Nostr identifiers:

### nevent (Regular Event)

Regular video events (kinds 21, 22):

```
nevent1qvzqqqqqz5q3jamnwvaz7tmgv9mx2m3wwdkxjer9wd68ytnwv46z7qpq8r5f947gp2tnxap68ew8dau6lmahwvta8rjgz4tplad4tefnph2sx9sssk
```

### naddr (Addressable Event)

Addressable video events (kinds 34235, 34236 - NIP-71):

```
naddr1qvzqqqy9hvpzp3yw98cykjpvcqw2r7003jrwlqcccpv7p6f4xg63vtcgpunwznq3qy88wumn8ghj7mn0wvhxcmmv9uqrk4rgv5k5wun9v96z6snfw33k76tw94qhwcttv4hxjmn894qk6etjd93kzm3dfphkgmpdg4exj6edgdshxmmw9568g6pkxsusmx2zsj
```

### note (Event ID)

Plain event ID (hex):

```
note1abc...def
```

## Features

### Content Warning

Videos with content warnings automatically show a blurred overlay. Users must click to reveal.

### Title Overlay

Video title and author appear at the top and fade out after 3 seconds. Reappears on hover or pause.

### Quality Selection

If a video has multiple quality variants, use the `quality` parameter:

```html
<!-- Prefer 720p if available -->
<iframe src="https://nostube.com/embed?v=nevent1...&quality=720p" ...></iframe>

<!-- Auto-select highest quality (default) -->
<iframe src="https://nostube.com/embed?v=nevent1...&quality=auto" ...></iframe>
```

### Custom Relays

Specify custom Nostr relays for fetching the video event:

```html
<iframe src="https://nostube.com/embed?v=nevent1...&relays=wss://relay1.com,wss://relay2.com" ...>
</iframe>
```

By default, the player uses:

1. Custom relays (if provided)
2. Hint relays from the nevent/naddr
3. Default fallback relays (relay.divine.video, relay.nostr.band, relay.damus.io)

## Responsive Sizing

For responsive embeds, wrap the iframe in a container:

```html
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe
    src="https://nostube.com/embed?v=nevent1..."
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
  >
  </iframe>
</div>
```

This creates a 16:9 aspect ratio that scales with the container width.

## Browser Support

The embed player works on all modern browsers:

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

**Requirements:**

- JavaScript enabled
- WebSocket support
- HTML5 video support

## Troubleshooting

### Video Not Loading

1. **Check the video ID** - Ensure it's a valid nevent/naddr/note identifier
2. **Check relay connectivity** - The video event must be available on at least one relay
3. **Check browser console** - Look for error messages
4. **Try custom relays** - Add `&relays=wss://relay.nostr.band` to use a specific relay

### Autoplay Not Working

Browsers require videos to be muted for autoplay:

```html
<!-- Correct: autoplay with muted -->
<iframe src="...?v=nevent1...&autoplay=1&muted=1" allow="autoplay"></iframe>

<!-- Won't work: autoplay without muted -->
<iframe src="...?v=nevent1...&autoplay=1"></iframe>
```

### Video Shows "Video Not Found"

- The event may not exist on the relays being queried
- Try adding more relays with the `relays` parameter
- Verify the video ID is correct

## Privacy

The embed player:

- ✅ No tracking or analytics
- ✅ No cookies
- ✅ No external dependencies except nostr relays
- ✅ All data fetched directly from Nostr relays

## Technical Details

- **Bundle Size:** ~150KB (gzipped)
- **Dependencies:** nostr-tools (bundled)
- **Video Formats:** MP4, WebM, and any HTML5-supported format
- **Protocols:** Nostr (NIP-01, NIP-19, NIP-71, NIP-92)

## Support

For issues, questions, or feature requests:

- GitHub: [nostube/issues](https://github.com/nostube/nostube/issues)
- Nostr: [npub1...]

## License

MIT License - See LICENSE file for details

````

**Step 2: Commit**

```bash
git add public/embed-README.md
git commit -m "docs: add comprehensive embed player README

- Quick start guide
- All parameters documented
- Examples for common use cases
- Responsive sizing guide
- Troubleshooting section
- Browser support information
- Privacy and technical details"
````

---

## Phase 6: Final Polish

### Task 12: Add npm Script and Update Main README

**Files:**

- Modify: `package.json`
- Modify: `README.md`

**Step 1: Verify build script in package.json**

Already added in Task 1. Verify it exists:

```json
"scripts": {
  ...
  "build:embed": "node scripts/build-embed.js",
  "build:embed:watch": "node scripts/build-embed.js --watch",
  ...
}
```

**Step 2: Add embed section to main README**

Read current README:

```bash
head -50 README.md
```

Then add an "Embed Player" section. Modify `README.md`:

Add after the main project description:

````markdown
## Embed Player

Nostube provides a standalone embeddable video player that can be used on any website.

### Quick Start

```html
<iframe
  src="https://nostube.com/embed?v=YOUR_VIDEO_ID"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
>
</iframe>
```
````

### Documentation

- **Full Documentation:** [embed-README.md](public/embed-README.md)
- **Live Examples:** [embed-example.html](https://nostube.com/embed-example.html)
- **Test Page:** [embed-test.html](public/embed-test.html)

### Development

Build the embed player:

```bash
npm run build:embed        # Build once
npm run build:embed:watch  # Watch mode
```

Source code: `src/embed/`
Output: `public/nostube-embed.js`

````

**Step 3: Test full build**

```bash
# Build embed player
npm run build:embed

# Build main app
npm run build

# Verify files exist
ls -lh public/nostube-embed.js public/nostube-embed.css public/embed-example.html
````

Expected: All files present, nostube-embed.js is ~150-200KB minified

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add embed player section to main README

- Quick start example
- Links to full documentation
- Development instructions
- Build commands"
```

---

## Final Verification

### Task 13: Complete Testing Checklist

**Test all features systematically:**

**Step 1: Basic functionality**

```bash
npm run build:embed
npm run dev
```

Open `http://localhost:8080/embed-example.html`

✅ Test checklist:

- [ ] nevent video loads and plays
- [ ] naddr video loads and plays
- [ ] Video controls work (play, pause, seek, volume, fullscreen)
- [ ] Poster thumbnail shows before play
- [ ] Error handling (invalid ID shows error message)

**Step 2: Parameters**

✅ Test each parameter:

- [ ] `autoplay=1&muted=1` - Video auto-plays
- [ ] `loop=1` - Video loops
- [ ] `t=30` - Starts at 30 seconds
- [ ] `controls=0` - No controls shown
- [ ] `title=0` - No title overlay
- [ ] `branding=0` - No branding link
- [ ] `color=ff6b6b` - Red branding color

**Step 3: UI overlays**

✅ Test overlays:

- [ ] Title appears on load
- [ ] Title fades out after 3 seconds
- [ ] Title reappears on hover
- [ ] Title shows when paused
- [ ] Branding link is clickable
- [ ] Branding opens in new tab
- [ ] Content warning (if video has one)

**Step 4: Error states**

✅ Test error handling:

- [ ] Invalid video ID shows error
- [ ] Network failure shows retry option
- [ ] Missing video shows "not found"

**Step 5: Mobile testing**

✅ Test on mobile:

- [ ] Player scales correctly
- [ ] Touch controls work
- [ ] Fullscreen works
- [ ] Autoplay works (with muted)

**Step 6: Cross-browser**

✅ Test browsers:

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Mobile Safari
- [ ] Chrome Mobile

**Step 7: Documentation**

✅ Verify documentation:

- [ ] README.md has embed section
- [ ] embed-README.md is comprehensive
- [ ] embed-example.html shows all features
- [ ] All code examples work

**Step 8: Final commit**

```bash
git add -A
git commit -m "test: verify all embed player features

- All parameters working correctly
- UI overlays functioning properly
- Error states displaying correctly
- Cross-browser compatibility verified
- Documentation complete and accurate"
```

---

## Implementation Complete!

The embeddable video player is now fully implemented with:

✅ **Core Features:**

- NIP-19 identifier decoding (nevent, naddr, note)
- Smart relay selection with fallbacks
- Video event parsing (NIP-71, NIP-92)
- HTML5 video player with native controls
- Multiple video source fallbacks
- Quality selection

✅ **UI Components:**

- Loading states
- Error handling with retry
- Content warning overlay
- Title overlay with auto-hide
- Branding link

✅ **Configuration:**

- 11 URL parameters for customization
- Responsive sizing
- Custom accent colors
- Autoplay, muted, loop support

✅ **Documentation:**

- Comprehensive README
- Interactive examples page
- Test page with multiple scenarios
- Code snippets for all use cases

✅ **Testing:**

- Manual testing checklist
- Cross-browser compatibility
- Mobile device support
- Error state verification

**Build the player:**

```bash
npm run build:embed
```

**Output files:**

- `public/nostube-embed.js` (~150KB gzipped)
- `public/nostube-embed.css`
- `public/embed-example.html`
- `public/embed-README.md`

**Next steps:**

1. Deploy to production
2. Test with real-world embeds
3. Monitor for issues
4. Gather user feedback
5. Plan Phase 2 enhancements (Blossom integration, HLS support)

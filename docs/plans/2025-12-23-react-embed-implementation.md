# React Embed Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the vanilla JavaScript embed with a React-based embed that reuses the main app's VideoPlayer component.

**Architecture:** Vite multi-entry build with a lightweight Nostr client (ported from vanilla JS to TypeScript). The React boundary starts at EmbedApp - everything before (URL parsing, Nostr fetching) is vanilla TypeScript for fast initial load.

**Tech Stack:** React 19, TypeScript, Vite multi-entry, vite-plugin-singlefile, VideoPlayer component, nostr-tools for NIP-19 decoding.

---

## Phase 1: Build Configuration

### Task 1: Install vite-plugin-singlefile

**Files:**

- Modify: `package.json`

**Step 1: Add the dependency**

```bash
npm install --save-dev vite-plugin-singlefile
```

**Step 2: Verify installation**

```bash
npm ls vite-plugin-singlefile
```

Expected: Shows version installed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vite-plugin-singlefile for embed bundling"
```

---

### Task 2: Create embed.html entry point

**Files:**

- Create: `embed.html`

**Step 1: Create the file**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Nostube embeddable video player for Nostr video content" />
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
        background: #000;
      }
    </style>
  </head>
  <body>
    <div id="nostube-embed"></div>
    <script type="module" src="/src/embed-react/index.tsx"></script>
  </body>
</html>
```

**Step 2: Commit**

```bash
git add embed.html
git commit -m "feat(embed): add React embed HTML entry point"
```

---

### Task 3: Configure Vite for multi-entry build

**Files:**

- Modify: `vite.config.ts`

**Step 1: Update vite.config.ts**

Add the multi-entry configuration. The key changes:

1. Import `resolve` from path
2. Import `viteSingleFile`
3. Add conditional plugin application
4. Configure rollupOptions.input

```typescript
import path, { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
    viteSingleFile({
      useRecommendedBuildConfig: false,
      removeViteModuleLoader: true,
      inlinePattern: ['embed/**/*'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
      external: ['@rollup/rollup-linux-x64-gnu'],
      output: {
        inlineDynamicImports: false,
        chunkFileNames: 'assets/[name]-[hash].js',
        experimentalMinChunkSize: 20000,
      },
    },
    chunkSizeWarningLimit: 1100,
  },
})
```

**Step 2: Test build configuration**

```bash
npm run build
```

Expected: Build succeeds, creates `dist/embed.html`

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat(embed): configure Vite multi-entry build with singlefile plugin"
```

---

## Phase 2: Core Embed Modules (TypeScript ports)

### Task 4: Create embed directory structure

**Files:**

- Create: `src/embed-react/` directory

**Step 1: Create directories**

```bash
mkdir -p src/embed-react/lib
mkdir -p src/embed-react/components
```

**Step 2: Commit**

```bash
git add .gitkeep 2>/dev/null || true
git commit --allow-empty -m "chore(embed): create React embed directory structure"
```

---

### Task 5: Port url-params.ts

**Files:**

- Create: `src/embed-react/lib/url-params.ts`

**Step 1: Create the file**

```typescript
/**
 * Embed URL parameters configuration
 */
export interface EmbedParams {
  videoId: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  startTime: number
  controls: boolean
  showTitle: boolean
  showBranding: boolean
  preferredQuality: string
  customRelays: string[]
  accentColor: string
}

/**
 * Parse URL query parameters into config object
 */
export function parseURLParams(): EmbedParams {
  const params = new URLSearchParams(window.location.search)

  return {
    videoId: params.get('v') || '',
    autoplay: params.get('autoplay') === '1',
    muted: params.get('muted') === '1',
    loop: params.get('loop') === '1',
    startTime: parseInt(params.get('t') || '0', 10),
    controls: params.get('controls') !== '0',
    showTitle: params.get('title') !== '0',
    showBranding: params.get('branding') !== '0',
    preferredQuality: params.get('quality') || 'auto',
    customRelays: params.get('relays')
      ? params
          .get('relays')!
          .split(',')
          .map(r => r.trim())
      : [],
    accentColor: params.get('color') || '8b5cf6',
  }
}

/**
 * Validate required parameters
 */
export function validateParams(config: EmbedParams): { valid: boolean; error?: string } {
  if (!config.videoId) {
    return { valid: false, error: 'Missing required parameter: v (video ID)' }
  }

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

**Step 2: Commit**

```bash
git add src/embed-react/lib/url-params.ts
git commit -m "feat(embed): add URL params parser"
```

---

### Task 6: Port nostr-decoder.ts

**Files:**

- Create: `src/embed-react/lib/nostr-decoder.ts`

**Step 1: Create the file**

```typescript
import { nip19 } from 'nostr-tools'

export interface EventIdentifier {
  type: 'event'
  data: {
    id: string
    relays: string[]
  }
}

export interface AddressIdentifier {
  type: 'address'
  data: {
    kind: number
    pubkey: string
    identifier: string
    relays: string[]
  }
}

export type DecodedIdentifier = EventIdentifier | AddressIdentifier

/**
 * Decode a NIP-19 identifier (nevent, naddr, note)
 */
export function decodeVideoIdentifier(identifier: string): DecodedIdentifier | null {
  try {
    const decoded = nip19.decode(identifier)

    if (decoded.type === 'nevent') {
      return {
        type: 'event',
        data: {
          id: decoded.data.id,
          relays: decoded.data.relays || [],
        },
      }
    }

    if (decoded.type === 'note') {
      return {
        type: 'event',
        data: {
          id: decoded.data as string,
          relays: [],
        },
      }
    }

    if (decoded.type === 'naddr') {
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
 */
export function getDefaultRelays(): string[] {
  return ['wss://relay.divine.video', 'wss://relay.nostr.band']
}

/**
 * Build final relay list with priorities
 */
export function buildRelayList(hintRelays: string[] = [], customRelays: string[] = []): string[] {
  const relays = [...customRelays, ...hintRelays, ...getDefaultRelays()]
  return [...new Set(relays)]
}
```

**Step 2: Commit**

```bash
git add src/embed-react/lib/nostr-decoder.ts
git commit -m "feat(embed): add Nostr decoder for NIP-19 identifiers"
```

---

### Task 7: Port event-cache.ts

**Files:**

- Create: `src/embed-react/lib/event-cache.ts`

**Step 1: Create the file**

```typescript
import type { NostrEvent } from 'nostr-tools'

const CACHE_PREFIX = 'nostube-embed-event-'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CachedData {
  event: NostrEvent
  fetchedAt: number
}

/**
 * EventCache - Cache Nostr video events in localStorage
 */
export class EventCache {
  /**
   * Get cached event from localStorage
   */
  static getCachedEvent(eventId: string): NostrEvent | null {
    try {
      const key = CACHE_PREFIX + eventId
      const cached = localStorage.getItem(key)

      if (!cached) {
        return null
      }

      const data: CachedData = JSON.parse(cached)

      if (!EventCache.isCacheValid(data)) {
        localStorage.removeItem(key)
        return null
      }

      return data.event
    } catch (error) {
      console.error('[EventCache] Cache read error:', error)
      return null
    }
  }

  /**
   * Store event in localStorage cache
   */
  static setCachedEvent(eventId: string, event: NostrEvent): void {
    try {
      const key = CACHE_PREFIX + eventId
      const data: CachedData = {
        event,
        fetchedAt: Date.now(),
      }
      localStorage.setItem(key, JSON.stringify(data))
    } catch (error) {
      console.error('[EventCache] Cache write error:', error)
    }
  }

  /**
   * Check if cached data is still valid
   */
  static isCacheValid(cachedData: CachedData): boolean {
    if (!cachedData || !cachedData.fetchedAt) {
      return false
    }
    const age = Date.now() - cachedData.fetchedAt
    return age < CACHE_TTL_MS
  }

  /**
   * Generate cache key for addressable events (naddr)
   */
  static getAddressableKey(kind: number, pubkey: string, identifier: string): string {
    return `${kind}:${pubkey}:${identifier}`
  }
}
```

**Step 2: Commit**

```bash
git add src/embed-react/lib/event-cache.ts
git commit -m "feat(embed): add event cache with localStorage"
```

---

### Task 8: Port nostr-client.ts

**Files:**

- Create: `src/embed-react/lib/nostr-client.ts`

**Step 1: Create the file**

```typescript
import type { NostrEvent } from 'nostr-tools'
import { EventCache } from './event-cache'
import type { DecodedIdentifier } from './nostr-decoder'

interface Subscription {
  ws: WebSocket
  handler: (event: MessageEvent) => void
}

/**
 * Simple Nostr relay client for fetching video events
 * Optimized for fast initial load with early-return strategies
 */
export class NostrClient {
  private relays: string[]
  private connections: Map<string, WebSocket> = new Map()
  private subscriptions: Map<string, Subscription[]> = new Map()

  constructor(relays: string[]) {
    this.relays = relays
  }

  /**
   * Connect to a single relay
   */
  async connectRelay(url: string): Promise<WebSocket> {
    // Return existing connection if available
    const existing = this.connections.get(url)
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout: ${url}`))
      }, 5000)

      try {
        const ws = new WebSocket(url)

        ws.onopen = () => {
          clearTimeout(timeout)
          this.connections.set(url, ws)
          resolve(ws)
        }

        ws.onerror = error => {
          clearTimeout(timeout)
          reject(error)
        }

        ws.onclose = () => {
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
   */
  async fetchEvent(identifier: DecodedIdentifier): Promise<NostrEvent> {
    // Generate cache key
    let cacheKey: string
    if (identifier.type === 'event') {
      cacheKey = identifier.data.id
    } else {
      cacheKey = EventCache.getAddressableKey(
        identifier.data.kind,
        identifier.data.pubkey,
        identifier.data.identifier
      )
    }

    // Check cache first
    const cached = EventCache.getCachedEvent(cacheKey)
    if (cached) {
      return cached
    }

    const subId = `embed-${Date.now()}`

    // Build filter
    let filter: Record<string, unknown>
    if (identifier.type === 'event') {
      filter = { ids: [identifier.data.id] }
    } else {
      filter = {
        kinds: [identifier.data.kind],
        authors: [identifier.data.pubkey],
        '#d': [identifier.data.identifier],
      }
    }

    const isAddressable = identifier.type === 'address'

    return new Promise((resolve, reject) => {
      let resolved = false
      const collectedEvents: NostrEvent[] = []
      let eoseCount = 0
      let connectedCount = 0
      let failedCount = 0
      const totalRelays = this.relays.length
      let earlyReturnTimer: ReturnType<typeof setTimeout> | null = null

      // Overall timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
          this.closeSubscription(subId)

          if (collectedEvents.length > 0) {
            const newest = collectedEvents.reduce((prev, current) =>
              current.created_at > prev.created_at ? current : prev
            )
            EventCache.setCachedEvent(cacheKey, newest)
            resolve(newest)
          } else {
            reject(new Error('Event not found (timeout)'))
          }
        }
      }, 6000)

      const handleMessage = (event: MessageEvent) => {
        if (resolved) return

        try {
          const message = JSON.parse(event.data)

          if (message[0] === 'EVENT' && message[1] === subId) {
            const nostrEvent = message[2] as NostrEvent

            if (isAddressable) {
              collectedEvents.push(nostrEvent)

              if (!earlyReturnTimer && collectedEvents.length === 1) {
                earlyReturnTimer = setTimeout(() => {
                  if (!resolved && collectedEvents.length > 0) {
                    resolved = true
                    clearTimeout(timeout)
                    this.closeSubscription(subId)
                    const newest = collectedEvents.reduce((prev, current) =>
                      current.created_at > prev.created_at ? current : prev
                    )
                    EventCache.setCachedEvent(cacheKey, newest)
                    resolve(newest)
                  }
                }, 200)
              }
            } else {
              resolved = true
              clearTimeout(timeout)
              if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
              this.closeSubscription(subId)
              EventCache.setCachedEvent(cacheKey, nostrEvent)
              resolve(nostrEvent)
            }
          }

          if (message[0] === 'EOSE' && message[1] === subId) {
            eoseCount++

            if (isAddressable && !resolved) {
              if (collectedEvents.length > 0) {
                resolved = true
                clearTimeout(timeout)
                if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
                this.closeSubscription(subId)
                const newest = collectedEvents.reduce((prev, current) =>
                  current.created_at > prev.created_at ? current : prev
                )
                EventCache.setCachedEvent(cacheKey, newest)
                resolve(newest)
              } else if (eoseCount === connectedCount) {
                resolved = true
                clearTimeout(timeout)
                if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
                this.closeSubscription(subId)
                reject(new Error('Addressable event not found on any relay'))
              }
            }
          }
        } catch (error) {
          console.error('[Nostr Client] Failed to parse message:', error)
        }
      }

      const subscribeToRelay = (ws: WebSocket) => {
        ws.addEventListener('message', handleMessage)

        if (!this.subscriptions.has(subId)) {
          this.subscriptions.set(subId, [])
        }
        this.subscriptions.get(subId)!.push({ ws, handler: handleMessage })

        const reqMessage = JSON.stringify(['REQ', subId, filter])
        ws.send(reqMessage)
      }

      this.relays.forEach(url => {
        this.connectRelay(url)
          .then(ws => {
            if (resolved) return
            connectedCount++
            subscribeToRelay(ws)
          })
          .catch(() => {
            failedCount++
            if (failedCount === totalRelays && !resolved) {
              resolved = true
              clearTimeout(timeout)
              if (earlyReturnTimer) clearTimeout(earlyReturnTimer)
              reject(new Error('Failed to connect to any relay'))
            }
          })
      })
    })
  }

  /**
   * Close subscription and clean up
   */
  closeSubscription(subId: string): void {
    const subs = this.subscriptions.get(subId)
    if (!subs) return

    subs.forEach(({ ws, handler }) => {
      try {
        ws.send(JSON.stringify(['CLOSE', subId]))
        ws.removeEventListener('message', handler)
      } catch {
        // Ignore errors during cleanup
      }
    })

    this.subscriptions.delete(subId)
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.subscriptions.forEach((_, subId) => {
      this.closeSubscription(subId)
    })

    this.connections.forEach(ws => {
      try {
        ws.close()
      } catch {
        // Ignore errors during cleanup
      }
    })

    this.connections.clear()
  }
}
```

**Step 2: Commit**

```bash
git add src/embed-react/lib/nostr-client.ts
git commit -m "feat(embed): add lightweight Nostr relay client"
```

---

### Task 9: Port profile-fetcher.ts

**Files:**

- Create: `src/embed-react/lib/profile-fetcher.ts`

**Step 1: Create the file**

```typescript
import type { NostrClient } from './nostr-client'

const CACHE_PREFIX = 'nostube-embed-profile-'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const PROFILE_FETCH_TIMEOUT_MS = 5000

export interface Profile {
  picture: string | null
  displayName: string | null
  name: string | null
  nip05: string | null
}

interface CachedProfile {
  profile: Profile
  fetchedAt: number
}

/**
 * ProfileFetcher - Fetch and cache Nostr user profiles (kind 0)
 */
export class ProfileFetcher {
  private client: NostrClient

  constructor(client: NostrClient) {
    this.client = client
  }

  /**
   * Fetch profile for a given pubkey
   */
  async fetchProfile(pubkey: string, relays: string[]): Promise<Profile | null> {
    if (!pubkey || !relays || relays.length === 0) {
      return null
    }

    // Check cache first
    const cached = ProfileFetcher.getCachedProfile(pubkey)
    if (cached) {
      return cached
    }

    try {
      const profile = await this.fetchFromRelays(pubkey, relays)
      if (profile) {
        ProfileFetcher.setCachedProfile(pubkey, profile)
        return profile
      }
      return null
    } catch (error) {
      console.error('[ProfileFetcher] Fetch failed:', error)
      return null
    }
  }

  /**
   * Fetch profile event from relays
   */
  private async fetchFromRelays(pubkey: string, relays: string[]): Promise<Profile | null> {
    const subId = `profile-${Date.now()}`
    const filter = {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    }

    // Connect to relays
    const connections: WebSocket[] = []
    for (const url of relays) {
      try {
        const ws = await this.client.connectRelay(url)
        connections.push(ws)
      } catch {
        // Skip failed connections
      }
    }

    if (connections.length === 0) {
      return null
    }

    return new Promise(resolve => {
      let resolved = false
      let latestEvent: { created_at: number; content: string } | null = null
      let eoseCount = 0

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve(latestEvent ? ProfileFetcher.parseProfileMetadata(latestEvent) : null)
        }
      }, PROFILE_FETCH_TIMEOUT_MS)

      const handlers: Array<{ ws: WebSocket; handler: (e: MessageEvent) => void }> = []

      const cleanup = () => {
        handlers.forEach(({ ws, handler }) => {
          try {
            ws.send(JSON.stringify(['CLOSE', subId]))
            ws.removeEventListener('message', handler)
          } catch {
            // Ignore
          }
        })
      }

      connections.forEach(ws => {
        const handler = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data)

            if (message[0] === 'EVENT' && message[1] === subId) {
              const nostrEvent = message[2]
              if (!latestEvent || nostrEvent.created_at > latestEvent.created_at) {
                latestEvent = nostrEvent
              }
            }

            if (message[0] === 'EOSE' && message[1] === subId) {
              eoseCount++
              if (eoseCount === connections.length && !resolved) {
                resolved = true
                clearTimeout(timeout)
                cleanup()
                resolve(latestEvent ? ProfileFetcher.parseProfileMetadata(latestEvent) : null)
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.addEventListener('message', handler)
        handlers.push({ ws, handler })
        ws.send(JSON.stringify(['REQ', subId, filter]))
      })
    })
  }

  /**
   * Parse profile metadata from kind 0 event
   */
  static parseProfileMetadata(event: { content: string }): Profile {
    try {
      const content = JSON.parse(event.content)
      return {
        picture: content.picture || null,
        displayName: content.display_name || null,
        name: content.name || null,
        nip05: content.nip05 || null,
      }
    } catch {
      return { picture: null, displayName: null, name: null, nip05: null }
    }
  }

  /**
   * Get cached profile from localStorage
   */
  static getCachedProfile(pubkey: string): Profile | null {
    try {
      const key = CACHE_PREFIX + pubkey
      const cached = localStorage.getItem(key)
      if (!cached) return null

      const data: CachedProfile = JSON.parse(cached)
      if (Date.now() - data.fetchedAt > CACHE_TTL_MS) {
        localStorage.removeItem(key)
        return null
      }
      return data.profile
    } catch {
      return null
    }
  }

  /**
   * Store profile in localStorage cache
   */
  static setCachedProfile(pubkey: string, profile: Profile): void {
    try {
      const key = CACHE_PREFIX + pubkey
      const data: CachedProfile = { profile, fetchedAt: Date.now() }
      localStorage.setItem(key, JSON.stringify(data))
    } catch {
      // Ignore storage errors
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/embed-react/lib/profile-fetcher.ts
git commit -m "feat(embed): add profile fetcher with caching"
```

---

### Task 10: Port video-parser.ts

**Files:**

- Create: `src/embed-react/lib/video-parser.ts`

**Step 1: Create the file**

```typescript
import type { NostrEvent } from 'nostr-tools'

export interface VideoVariant {
  url: string
  mimeType?: string
  dimensions?: string
  size?: number
  hash?: string
  fallbackUrls: string[]
  quality?: string
}

export interface ParsedVideo {
  id: string
  kind: number
  title: string
  description: string
  author: string
  createdAt: number
  duration: number
  contentWarning?: string
  videoVariants: VideoVariant[]
  thumbnails: Array<{ url: string; fallbackUrls: string[] }>
}

/**
 * Parse a Nostr video event into usable metadata
 */
export function parseVideoEvent(event: NostrEvent): ParsedVideo {
  const imetaTags = event.tags.filter(t => t[0] === 'imeta')

  if (imetaTags.length > 0) {
    return parseImetaFormat(event, imetaTags)
  } else {
    return parseLegacyFormat(event)
  }
}

function parseImetaFormat(event: NostrEvent, imetaTags: string[][]): ParsedVideo {
  const allVariants = imetaTags.map(tag => parseImetaTag(tag)).filter(Boolean) as VideoVariant[]

  const videoVariants = allVariants.filter(v => v.mimeType?.startsWith('video/'))
  const thumbnails = allVariants.filter(v => v.mimeType?.startsWith('image/'))

  // Also collect standalone image URLs
  imetaTags.forEach(tag => {
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i]
      if (part.startsWith('image ')) {
        const imageUrl = part.substring(6).trim()
        if (imageUrl && !thumbnails.some(t => t.url === imageUrl)) {
          thumbnails.push({ url: imageUrl, fallbackUrls: [] } as VideoVariant)
        }
      }
    }
  })

  // Sort by quality (highest first)
  videoVariants.sort((a, b) => {
    const qA = extractNumericQuality(a)
    const qB = extractNumericQuality(b)
    return qB - qA
  })

  // Add quality labels
  videoVariants.forEach(v => {
    const height = extractNumericQuality(v)
    if (height >= 2160) v.quality = '4K'
    else if (height >= 1080) v.quality = '1080p'
    else if (height >= 720) v.quality = '720p'
    else if (height >= 480) v.quality = '480p'
    else if (height >= 360) v.quality = '360p'
    else if (height > 0) v.quality = `${height}p`
  })

  const title =
    event.tags.find(t => t[0] === 'title')?.[1] ||
    event.tags.find(t => t[0] === 'alt')?.[1] ||
    event.content ||
    'Untitled Video'

  const description = event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]

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

function parseLegacyFormat(event: NostrEvent): ParsedVideo {
  const url = event.tags.find(t => t[0] === 'url')?.[1] || ''
  const mimeType = event.tags.find(t => t[0] === 'm')?.[1] || 'video/mp4'
  const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || ''
  const title = event.tags.find(t => t[0] === 'title')?.[1] || event.content || 'Untitled Video'
  const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]
  const dimensions = event.tags.find(t => t[0] === 'dim')?.[1]

  const videoVariants: VideoVariant[] = url ? [{ url, mimeType, dimensions, fallbackUrls: [] }] : []

  const thumbnails = thumb ? [{ url: thumb, fallbackUrls: [] }] : []

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

function parseImetaTag(imetaTag: string[]): VideoVariant | null {
  const data: Partial<VideoVariant> = { fallbackUrls: [] }

  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i]
    const spaceIndex = part.indexOf(' ')
    if (spaceIndex === -1) continue

    const key = part.substring(0, spaceIndex)
    const value = part.substring(spaceIndex + 1).trim()

    if (key === 'url') data.url = value
    else if (key === 'm') data.mimeType = value
    else if (key === 'dim') data.dimensions = value
    else if (key === 'size') data.size = parseInt(value, 10)
    else if (key === 'x') data.hash = value
    else if (key === 'fallback' || key === 'mirror') {
      data.fallbackUrls!.push(value)
    }
  }

  if (!data.url) return null
  return data as VideoVariant
}

function extractNumericQuality(variant: VideoVariant): number {
  if (variant.dimensions) {
    const match = variant.dimensions.match(/x(\d+)/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

/**
 * Select best video variant based on quality preference
 */
export function selectVideoVariant(
  variants: VideoVariant[],
  preferredQuality: string = 'auto'
): VideoVariant | null {
  if (!variants || variants.length === 0) return null

  if (preferredQuality === 'auto') return variants[0]

  const targetQuality = parseInt(preferredQuality, 10)
  if (isNaN(targetQuality)) return variants[0]

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

**Step 2: Commit**

```bash
git add src/embed-react/lib/video-parser.ts
git commit -m "feat(embed): add video event parser"
```

---

## Phase 3: React Components

### Task 11: Create EmbedApp component

**Files:**

- Create: `src/embed-react/EmbedApp.tsx`

**Step 1: Create the file**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import type { EmbedParams } from './lib/url-params'
import type { ParsedVideo, VideoVariant } from './lib/video-parser'
import type { Profile } from './lib/profile-fetcher'
import { TitleOverlay } from './components/TitleOverlay'
import { Branding } from './components/Branding'
import { ContentWarning } from './components/ContentWarning'
import { ErrorMessage } from './components/ErrorMessage'
import { LoadingState } from './components/LoadingState'

interface EmbedAppProps {
  params: EmbedParams
  video: ParsedVideo | null
  profile: Profile | null
  error: string | null
  isLoading: boolean
}

export function EmbedApp({ params, video, profile, error, isLoading }: EmbedAppProps) {
  const [contentWarningAccepted, setContentWarningAccepted] = useState(false)
  const [allSourcesFailed, setAllSourcesFailed] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

  // Handle all sources failed
  const handleAllSourcesFailed = useCallback(() => {
    setAllSourcesFailed(true)
  }, [])

  // Show controls on mouse move
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    const handleMouseMove = () => {
      setControlsVisible(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setControlsVisible(false), 2000)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(timeout)
    }
  }, [])

  // Loading state
  if (isLoading) {
    return <LoadingState />
  }

  // Error state
  if (error || !video) {
    return <ErrorMessage message={error || 'Video not found'} />
  }

  // All sources failed
  if (allSourcesFailed) {
    return <ErrorMessage message="Video unavailable - all sources failed" />
  }

  // No video variants
  if (video.videoVariants.length === 0) {
    return <ErrorMessage message="No video sources found" />
  }

  // Content warning (if not accepted)
  if (video.contentWarning && !contentWarningAccepted) {
    return (
      <ContentWarning
        reason={video.contentWarning}
        onAccept={() => setContentWarningAccepted(true)}
        color={params.accentColor}
        poster={video.thumbnails[0]?.url}
      />
    )
  }

  // Map video variants to VideoPlayer format
  const playerVariants: VideoVariant[] = video.videoVariants.map(v => ({
    url: v.url,
    fallbackUrls: v.fallbackUrls,
    quality: v.quality || '',
    hash: v.hash,
    mime: v.mimeType || 'video/mp4',
  }))

  const urls = video.videoVariants.map(v => v.url)
  const poster = video.thumbnails[0]?.url

  return (
    <div
      id="nostube-embed"
      className="relative w-full h-full bg-black"
      style={{ '--embed-accent': `#${params.accentColor}` } as React.CSSProperties}
    >
      <VideoPlayer
        urls={urls}
        videoVariants={playerVariants}
        mime={video.videoVariants[0]?.mimeType || 'video/mp4'}
        poster={poster}
        loop={params.loop}
        initialPlayPos={params.startTime}
        contentWarning={undefined} // Already handled above
        authorPubkey={video.author}
        sha256={video.videoVariants[0]?.hash}
        onAllSourcesFailed={handleAllSourcesFailed}
        textTracks={[]}
        className="w-full h-full"
      />

      {/* Title overlay */}
      {params.showTitle && (
        <TitleOverlay
          title={video.title}
          author={profile}
          authorPubkey={video.author}
          visible={controlsVisible}
          videoId={params.videoId}
        />
      )}

      {/* Branding */}
      {params.showBranding && (
        <Branding visible={controlsVisible} color={params.accentColor} videoId={params.videoId} />
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/embed-react/EmbedApp.tsx
git commit -m "feat(embed): add main EmbedApp component"
```

---

### Task 12: Create TitleOverlay component

**Files:**

- Create: `src/embed-react/components/TitleOverlay.tsx`

**Step 1: Create the file**

```tsx
import type { Profile } from '../lib/profile-fetcher'

interface TitleOverlayProps {
  title: string
  author: Profile | null
  authorPubkey: string
  visible: boolean
  videoId: string
}

export function TitleOverlay({ title, author, authorPubkey, visible, videoId }: TitleOverlayProps) {
  const displayName = author?.displayName || author?.name || authorPubkey.slice(0, 8) + '...'
  const watchUrl = `https://nostu.be/v/${videoId}`

  return (
    <div
      className={`absolute top-0 left-0 right-0 p-4 bg-linear-to-b from-black/80 to-transparent transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 mb-1">
        {author?.picture && (
          <img
            src={author.picture}
            alt={displayName}
            className="w-6 h-6 rounded-full object-cover"
          />
        )}
        <span className="text-white/80 text-sm">{displayName}</span>
      </div>

      {/* Title */}
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-white font-medium text-base hover:underline line-clamp-2"
      >
        {title}
      </a>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/embed-react/components/TitleOverlay.tsx
git commit -m "feat(embed): add TitleOverlay component"
```

---

### Task 13: Create Branding component

**Files:**

- Create: `src/embed-react/components/Branding.tsx`

**Step 1: Create the file**

```tsx
interface BrandingProps {
  visible: boolean
  color: string
  videoId: string
}

export function Branding({ visible, color, videoId }: BrandingProps) {
  const watchUrl = `https://nostu.be/video/${videoId}`

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`absolute bottom-12 right-3 px-2 py-1 rounded text-xs font-medium transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        background: `linear-gradient(135deg, #${color}, #${color}dd)`,
        color: 'white',
      }}
    >
      nostube
    </a>
  )
}
```

**Step 2: Commit**

```bash
git add src/embed-react/components/Branding.tsx
git commit -m "feat(embed): add Branding component"
```

---

### Task 14: Create ContentWarning component

**Files:**

- Create: `src/embed-react/components/ContentWarning.tsx`

**Step 1: Create the file**

```tsx
interface ContentWarningProps {
  reason: string
  onAccept: () => void
  color: string
  poster?: string
}

export function ContentWarning({ reason, onAccept, color, poster }: ContentWarningProps) {
  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {/* Blurred background */}
      {poster && (
        <div
          className="absolute inset-0 bg-cover bg-center blur-xl opacity-30"
          style={{ backgroundImage: `url(${poster})` }}
        />
      )}

      {/* Warning content */}
      <div className="relative z-10 text-center p-6 max-w-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-white text-lg font-semibold mb-2">Content Warning</h2>
        <p className="text-white/70 text-sm mb-6">
          {reason || 'This video may contain sensitive content.'}
        </p>
        <button
          onClick={onAccept}
          className="px-6 py-2 rounded-lg font-medium text-white transition-colors"
          style={{ backgroundColor: `#${color}` }}
        >
          Show anyway
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/embed-react/components/ContentWarning.tsx
git commit -m "feat(embed): add ContentWarning component"
```

---

### Task 15: Create ErrorMessage and LoadingState components

**Files:**

- Create: `src/embed-react/components/ErrorMessage.tsx`
- Create: `src/embed-react/components/LoadingState.tsx`

**Step 1: Create ErrorMessage.tsx**

```tsx
interface ErrorMessageProps {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="w-full h-full bg-black flex items-center justify-center">
      <div className="text-center p-6">
        <div className="text-4xl mb-4">😕</div>
        <p className="text-white/70 text-sm">{message}</p>
      </div>
    </div>
  )
}
```

**Step 2: Create LoadingState.tsx**

```tsx
export function LoadingState() {
  return (
    <div className="w-full h-full bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/embed-react/components/ErrorMessage.tsx src/embed-react/components/LoadingState.tsx
git commit -m "feat(embed): add ErrorMessage and LoadingState components"
```

---

### Task 16: Create embed entry point

**Files:**

- Create: `src/embed-react/index.tsx`

**Step 1: Create the file**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmbedApp } from './EmbedApp'
import { parseURLParams, validateParams } from './lib/url-params'
import { decodeVideoIdentifier, buildRelayList } from './lib/nostr-decoder'
import { NostrClient } from './lib/nostr-client'
import { ProfileFetcher } from './lib/profile-fetcher'
import { parseVideoEvent } from './lib/video-parser'
import type { ParsedVideo } from './lib/video-parser'
import type { Profile } from './lib/profile-fetcher'
import './embed.css'

interface EmbedState {
  video: ParsedVideo | null
  profile: Profile | null
  error: string | null
  isLoading: boolean
}

async function initEmbed(): Promise<void> {
  const root = document.getElementById('nostube-embed')
  if (!root) {
    console.error('[Embed] Root element not found')
    return
  }

  const reactRoot = createRoot(root)

  // Parse URL params
  const params = parseURLParams()
  const validation = validateParams(params)

  if (!validation.valid) {
    renderApp(reactRoot, params, {
      video: null,
      profile: null,
      error: validation.error!,
      isLoading: false,
    })
    return
  }

  // Show loading state
  renderApp(reactRoot, params, { video: null, profile: null, error: null, isLoading: true })

  try {
    // Decode video identifier
    const identifier = decodeVideoIdentifier(params.videoId)
    if (!identifier) {
      renderApp(reactRoot, params, {
        video: null,
        profile: null,
        error: 'Invalid video ID',
        isLoading: false,
      })
      return
    }

    // Build relay list
    const hintRelays = identifier.type === 'event' ? identifier.data.relays : identifier.data.relays
    const relays = buildRelayList(hintRelays, params.customRelays)

    // Create Nostr client
    const client = new NostrClient(relays)

    // Fetch video event
    const event = await client.fetchEvent(identifier)
    const video = parseVideoEvent(event)

    // Fetch profile in parallel (non-blocking)
    const profileFetcher = new ProfileFetcher(client)
    const profilePromise = profileFetcher.fetchProfile(video.author, relays)

    // Render with video data (profile may still be loading)
    renderApp(reactRoot, params, { video, profile: null, error: null, isLoading: false })

    // Update with profile when ready
    const profile = await profilePromise
    renderApp(reactRoot, params, { video, profile, error: null, isLoading: false })

    // Cleanup
    client.closeAll()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load video'
    renderApp(reactRoot, params, { video: null, profile: null, error: message, isLoading: false })
  }
}

function renderApp(
  root: ReturnType<typeof createRoot>,
  params: ReturnType<typeof parseURLParams>,
  state: EmbedState
): void {
  root.render(
    <StrictMode>
      <EmbedApp
        params={params}
        video={state.video}
        profile={state.profile}
        error={state.error}
        isLoading={state.isLoading}
      />
    </StrictMode>
  )
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmbed)
} else {
  initEmbed()
}
```

**Step 2: Commit**

```bash
git add src/embed-react/index.tsx
git commit -m "feat(embed): add React embed entry point"
```

---

### Task 17: Create embed CSS

**Files:**

- Create: `src/embed-react/embed.css`

**Step 1: Create the file**

```css
@import 'tailwindcss';

/* Reset for iframe isolation */
#nostube-embed {
  all: initial;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  box-sizing: border-box;
}

#nostube-embed *,
#nostube-embed *::before,
#nostube-embed *::after {
  box-sizing: border-box;
}

/* Ensure full viewport in iframe */
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

#nostube-embed {
  width: 100%;
  height: 100%;
}

/* Dark theme overrides */
#nostube-embed {
  --background: #000;
  --foreground: #fff;
}

/* Accent color support */
#nostube-embed {
  --embed-accent: #8b5cf6;
}

/* Animation for loading spinner */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* Line clamp for title */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

**Step 2: Commit**

```bash
git add src/embed-react/embed.css
git commit -m "feat(embed): add embed CSS with Tailwind"
```

---

## Phase 4: Cleanup & Migration

### Task 18: Update package.json scripts

**Files:**

- Modify: `package.json`

**Step 1: Remove old embed scripts**

Remove these lines from scripts:

```json
"build:embed": "node scripts/build-embed.js",
"build:embed:watch": "node scripts/build-embed.js --watch",
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: remove old embed build scripts"
```

---

### Task 19: Remove old vanilla embed files

**Files:**

- Delete: `src/embed/` (entire directory)
- Delete: `scripts/build-embed.js`
- Delete: `public/embed.js`
- Delete: `public/embed.css`

**Step 1: Remove files**

```bash
rm -rf src/embed
rm scripts/build-embed.js
rm public/embed.js
rm public/embed.css
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove vanilla JS embed implementation"
```

---

### Task 20: Update public/embed.html to redirect

**Files:**

- Modify: `public/embed.html`

**Step 1: Update to redirect to new embed**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=/embed.html" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting to new embed player...</p>
  </body>
</html>
```

Note: This preserves backwards compatibility for anyone referencing `/embed.html` from public/

**Step 2: Commit**

```bash
git add public/embed.html
git commit -m "feat(embed): redirect old embed URL to new React embed"
```

---

## Phase 5: Testing & Verification

### Task 21: Build and verify

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds, creates `dist/embed.html` with inlined JS/CSS

**Step 2: Check embed.html output**

```bash
ls -la dist/embed.html
```

Expected: File exists

**Step 3: Verify embed works in dev mode**

```bash
npm run dev
```

Then open: `http://localhost:8080/embed.html?v=nevent1...` (use a real video ID)

Expected: Video loads and plays

**Step 4: Commit any fixes**

If any issues, fix and commit.

---

### Task 22: Update CHANGELOG

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Add entry under [Unreleased]**

Add under "### Changed":

```markdown
- **Embed Player Rewrite**: Replaced vanilla JS embed with React-based embed using shared VideoPlayer component
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for React embed rewrite"
```

---

### Task 23: Final verification and format

**Step 1: Run format**

```bash
npm run format
```

**Step 2: Run full test suite**

```bash
npm run test
```

Expected: All tests pass, build succeeds

**Step 3: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: format code"
```

---

## Summary

**Total tasks:** 23

**Key files created:**

- `embed.html` - Entry point
- `src/embed-react/index.tsx` - React mount
- `src/embed-react/EmbedApp.tsx` - Main component
- `src/embed-react/lib/*.ts` - Nostr utilities (ported from vanilla JS)
- `src/embed-react/components/*.tsx` - UI components
- `src/embed-react/embed.css` - Styles

**Key files modified:**

- `vite.config.ts` - Multi-entry build
- `package.json` - Dependencies and scripts

**Key files removed:**

- `src/embed/` - Old vanilla JS embed
- `scripts/build-embed.js` - Old build script
- `public/embed.js`, `public/embed.css` - Old built files

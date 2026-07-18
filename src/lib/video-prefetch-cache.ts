/**
 * Video Prefetch Cache
 *
 * A single module-level manager that downloads upcoming shorts ahead of time and
 * keeps them as fully-materialized Blobs, so the singleton <video> element can
 * play the next clip from a local object URL the instant it becomes active —
 * with no network round-trip on the swipe-to-playback critical path.
 *
 * Why this exists (and why HTTP-cache warming alone isn't enough): a <video>
 * element issues Range requests, which browsers don't reliably serve from the
 * HTTP cache. A prefetched Blob is a real local source, so playback starts
 * immediately and deterministically.
 *
 * Design decisions that make this robust where the previous per-hook fetch was
 * not:
 *  - Content-addressed keys. Blossom videos are addressed by sha256, so we key
 *    the cache by the video's hash (falling back to URL only when no hash is
 *    known). The active player and the prefetcher therefore agree on the cache
 *    key even if they resolve to different mirror URLs — the old URL-keyed cache
 *    silently missed whenever discovery reordered mirrors.
 *  - CORS-aware. Reading bytes cross-origin requires the server to send CORS
 *    headers; many Blossom hosts don't. A cors fetch that fails before any bytes
 *    arrive marks that origin non-prefetchable so we stop thrashing it — the
 *    singleton just loads the URL directly (a plain <video src> needs no CORS).
 *  - Bounded. A global concurrency limit keeps prefetch from competing with the
 *    playing video; a byte budget + LRU eviction + per-file size cap keep memory
 *    in check on long sessions.
 *
 * All work is best-effort: every error is swallowed. The active player's own URL
 * failover still handles real playback failures.
 */

const DEBUG_STORAGE_KEY = 'nostube:prefetch-debug'

/** Enable verbose prefetch logging via `localStorage['nostube:prefetch-debug'] = 'true'`. */
export function isPrefetchDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function debugLog(...args: unknown[]): void {
  if (isPrefetchDebugEnabled()) {
    console.debug('[video-prefetch]', ...args)
  }
}

// --- Tuning ---------------------------------------------------------------

/** How many videos may download at once. Kept low so prefetch never starves the
 *  currently-playing video of bandwidth. */
const MAX_CONCURRENT_DOWNLOADS = 2
/** Total bytes of cached Blobs to retain before evicting least-recently-used. */
const MAX_TOTAL_BYTES = 256 * 1024 * 1024
/** Max number of cached Blobs, independent of size. */
const MAX_ENTRIES = 6
/** Don't cache a single file larger than this — shorts are small; a giant file is
 *  almost certainly not a short and isn't worth the memory. */
const MAX_FILE_BYTES = 96 * 1024 * 1024

// --- Types ----------------------------------------------------------------

export interface PrefetchTarget {
  /** sha256 of the content, when known (Blossom videos are content-addressed). */
  sha256?: string
  /** Resolved playback URL to download. */
  url: string
  /** Lower number = fetch sooner. Distance from the active video works well
   *  (0 = active, 1 = next, 2 = next+1, …). */
  priority: number
}

interface CacheEntry {
  key: string
  blob: Blob
  bytes: number
  lastAccess: number
}

interface InFlight {
  key: string
  url: string
  priority: number
}

interface QueueItem {
  key: string
  url: string
  priority: number
}

// --- State ----------------------------------------------------------------

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlight>()
const queue = new Map<string, QueueItem>()
/** Origins that rejected a cors read before sending any bytes. */
const nonCorsableOrigins = new Set<string>()
let totalBytes = 0

// --- Keys -----------------------------------------------------------------

/** Canonical cache key. Prefer the content hash so the key is mirror-independent. */
function cacheKeyFor(target: { sha256?: string; url: string }): string {
  if (target.sha256) return `sha256:${target.sha256}`
  return `url:${target.url}`
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Return a fully-downloaded Blob for the given video, if one was prefetched.
 * Looks up by content hash first, then by URL — matching however it was stored.
 */
export function getPrefetchedVideoBlob(target: { sha256?: string; url: string }): Blob | undefined {
  const entry = cache.get(cacheKeyFor(target))
  if (!entry) return undefined
  entry.lastAccess = Date.now()
  return entry.blob
}

/**
 * Ask the manager to prefetch a target. Idempotent per key: re-requesting an
 * already-cached, in-flight, or queued target just refreshes its priority.
 * Returns silently if the target can't/needn't be prefetched.
 */
export function requestPrefetch(target: PrefetchTarget): void {
  const key = cacheKeyFor(target)

  // Already have it — nothing to do (refresh recency so it survives eviction).
  const cached = cache.get(key)
  if (cached) {
    cached.lastAccess = Date.now()
    return
  }

  // Skip origins we've learned can't be read cross-origin.
  const origin = originOf(target.url)
  if (origin && nonCorsableOrigins.has(origin)) {
    debugLog('skip (non-corsable origin)', target.url)
    return
  }

  // Respect metered / very slow connections.
  if (shouldSkipForConnection()) {
    debugLog('skip (metered/slow connection)')
    return
  }

  const existing = inFlight.get(key)
  if (existing) {
    existing.priority = Math.min(existing.priority, target.priority)
    return
  }

  queue.set(key, { key, url: target.url, priority: target.priority })
  pump()
}

/**
 * Cancel a prefetch that is no longer wanted (e.g. a neighbor scrolled out of
 * the window). Only *pending* work is dropped: a download already in flight is
 * left to finish into the cache. This matters because the shorts window is
 * driven by positional hooks — a single forward swipe shifts every neighbor by
 * one and fires cancel on a video that is frequently mid-download. Aborting
 * there would throw away an almost-complete download of the very clip about to
 * play and restart it from zero, the opposite of smooth on a slow link. A file
 * that ends up unused just ages out via LRU; concurrency and the byte budget
 * keep the wasted bandwidth bounded.
 */
export function cancelPrefetch(target: { sha256?: string; url: string }): void {
  const key = cacheKeyFor(target)
  if (queue.delete(key)) debugLog('dequeued (still-pending)', target.url)
}

// --- Scheduling -----------------------------------------------------------

/** Start queued downloads up to the concurrency limit, highest priority first. */
function pump(): void {
  while (inFlight.size < MAX_CONCURRENT_DOWNLOADS && queue.size > 0) {
    let best: QueueItem | undefined
    for (const item of queue.values()) {
      if (!best || item.priority < best.priority) best = item
    }
    if (!best) break
    queue.delete(best.key)
    startDownload(best)
  }
}

function startDownload(item: QueueItem): void {
  const entry: InFlight = {
    key: item.key,
    url: item.url,
    priority: item.priority,
  }
  inFlight.set(item.key, entry)
  debugLog('fetching', item.url, `(priority ${item.priority})`)

  download(item.url)
    .then(blob => {
      if (blob) store(item.key, blob)
    })
    .catch(error => {
      handleDownloadError(item.url, error)
    })
    .finally(() => {
      // Only clear if this exact entry is still the registered one.
      if (inFlight.get(item.key) === entry) inFlight.delete(item.key)
      pump()
    })
}

/**
 * Stream the response so we can enforce a per-file size cap and stop reading
 * cleanly if a file blows past it. Returns undefined (no cache) for non-OK
 * responses or oversize files rather than throwing, so those aren't mistaken
 * for CORS failures.
 */
async function download(url: string): Promise<Blob | undefined> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    // Advisory: keep prefetch below the active video's requests where honored.
    priority: 'low',
    cache: 'default',
  })

  if (!response.ok) {
    debugLog('non-ok response', response.status, url)
    return undefined
  }

  const contentType = response.headers.get('content-type') || 'video/mp4'
  const declaredLength = Number(response.headers.get('content-length') || '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
    debugLog('skip (too large)', declaredLength, url)
    return undefined
  }

  // No readable stream (older browsers): fall back to buffering the whole body.
  if (!response.body) {
    const blob = await response.blob()
    return blob.size <= MAX_FILE_BYTES ? blob : undefined
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      received += value.byteLength
      if (received > MAX_FILE_BYTES) {
        await reader.cancel()
        debugLog('abort (exceeded size cap mid-stream)', url)
        return undefined
      }
      chunks.push(value)
    }
  }

  return new Blob(chunks as BlobPart[], { type: contentType })
}

function handleDownloadError(url: string, error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') return

  // A TypeError from fetch() is the browser's opaque signal for a network/CORS
  // failure. Since a cors read needs CORS headers the origin evidently lacks,
  // stop prefetching that origin — the singleton loads its URL directly instead.
  if (error instanceof TypeError) {
    const origin = originOf(url)
    if (origin && !nonCorsableOrigins.has(origin)) {
      nonCorsableOrigins.add(origin)
      debugLog('marking origin non-corsable (prefetch unavailable here)', origin)
    }
    return
  }

  debugLog('download failed', url, error)
}

// --- Cache storage / eviction --------------------------------------------

function store(key: string, blob: Blob): void {
  const bytes = blob.size
  const existing = cache.get(key)
  if (existing) totalBytes -= existing.bytes
  cache.set(key, { key, blob, bytes, lastAccess: Date.now() })
  totalBytes += bytes
  debugLog('cached', key, `${(bytes / 1024 / 1024).toFixed(1)}MB`, `total ${cache.size}`)
  evictIfNeeded()
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
    let oldest: CacheEntry | undefined
    for (const entry of cache.values()) {
      if (!oldest || entry.lastAccess < oldest.lastAccess) oldest = entry
    }
    if (!oldest) break
    cache.delete(oldest.key)
    totalBytes -= oldest.bytes
    debugLog('evicted', oldest.key)
  }
}

// --- Connection awareness -------------------------------------------------

interface NetworkInformationLike {
  saveData?: boolean
  effectiveType?: string
}

function shouldSkipForConnection(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  if (!connection) return false
  if (connection.saveData) return true
  const type = connection.effectiveType
  return type === 'slow-2g' || type === '2g'
}

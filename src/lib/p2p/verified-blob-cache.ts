export type P2PBlobCacheSource = 'p2p' | 'blossom' | 'upload' | 'transcode'

export interface P2PBlobCacheEntry {
  sha256: string
  cacheUrl: string
  size: number
  mimeType?: string
  videoId?: string
  variantUrl?: string
  createdAt: number
  lastAccessedAt: number
  accessCount: number
  source: P2PBlobCacheSource
}

export interface P2PBlobCacheWrite {
  sha256: string
  bytes: Uint8Array
  mimeType?: string
  videoId?: string
  variantUrl?: string
  source: P2PBlobCacheSource
}

export interface P2PBlobCacheResult {
  entry: P2PBlobCacheEntry
  bytes: Uint8Array
  response: Response
}

export interface P2PBlobCacheEventDetail {
  sha256: string
  size?: number
  videoId?: string
  variantUrl?: string
  source?: P2PBlobCacheSource | 'cache'
  reason?: string
}

const DB_NAME = 'nostube-p2p-hls-blob-cache'
const DB_VERSION = 1
const STORE_NAME = 'entries'
const CACHE_NAME = 'nostube-p2p-hls-blobs-v1'
const CACHE_URL_PREFIX = '/__nostube_p2p_blob_cache__/'
const CACHE_QUOTA_FRACTION = 0.3
const P2P_CACHE_EVENT = 'nostube:p2p-hls-blob-cache'

let defaultCache: VerifiedBlobCache | null = null

function hasBrowserStorageApis() {
  return (
    typeof window !== 'undefined' &&
    typeof window.indexedDB !== 'undefined' &&
    typeof window.caches !== 'undefined' &&
    typeof window.crypto?.subtle !== 'undefined'
  )
}

function normalizeSha256(sha256: string) {
  return sha256.toLowerCase()
}

function createCacheUrl(sha256: string) {
  return `${window.location.origin}${CACHE_URL_PREFIX}${normalizeSha256(sha256)}`
}

function emitP2PBlobCacheEvent(type: string, detail: P2PBlobCacheEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(P2P_CACHE_EVENT, {
      detail: {
        type,
        ...detail,
      },
    })
  )
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function openMetadataDb(): Promise<IDBDatabase> {
  if (!hasBrowserStorageApis()) {
    throw new Error('P2P blob cache storage APIs are unavailable')
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'sha256' })
        store.createIndex('lastAccessedAt', 'lastAccessedAt')
        store.createIndex('source', 'source')
        store.createIndex('videoId', 'videoId')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open P2P blob cache DB'))
  })
}

function getQuotaExceededName(error: unknown) {
  return error instanceof DOMException ? error.name : undefined
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function getP2PCacheLimitBytes(): Promise<number> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return 0
  const estimate = await navigator.storage.estimate()
  return Math.floor((estimate.quota ?? 0) * CACHE_QUOTA_FRACTION)
}

export async function verifySha256(bytes: Uint8Array, expectedHex: string): Promise<boolean> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return false
  const digest = await crypto.subtle.digest('SHA-256', bytesToArrayBuffer(bytes))
  const actualHex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return actualHex === normalizeSha256(expectedHex)
}

export class VerifiedBlobCache {
  private dbPromise: Promise<IDBDatabase> | null = null

  enabled() {
    return hasBrowserStorageApis()
  }

  async get(sha256: string): Promise<P2PBlobCacheResult | null> {
    if (!this.enabled()) return null

    const normalizedHash = normalizeSha256(sha256)
    const entry = await this.getEntry(normalizedHash)
    if (!entry) {
      emitP2PBlobCacheEvent('cache-miss', { sha256: normalizedHash })
      return null
    }

    const cache = await window.caches.open(CACHE_NAME)
    const response = await cache.match(entry.cacheUrl)
    if (!response) {
      await this.delete(normalizedHash)
      emitP2PBlobCacheEvent('cache-miss', {
        sha256: normalizedHash,
        videoId: entry.videoId,
        variantUrl: entry.variantUrl,
        reason: 'bytes-missing',
      })
      return null
    }

    const bytes = new Uint8Array(await response.clone().arrayBuffer())
    await this.touch(normalizedHash)
    emitP2PBlobCacheEvent('cache-hit', {
      sha256: normalizedHash,
      size: bytes.byteLength,
      videoId: entry.videoId,
      variantUrl: entry.variantUrl,
      source: 'cache',
    })

    return {
      entry,
      bytes,
      response,
    }
  }

  async putVerified(write: P2PBlobCacheWrite): Promise<P2PBlobCacheEntry | null> {
    if (!this.enabled()) return null

    const sha256 = normalizeSha256(write.sha256)
    const isValid = await verifySha256(write.bytes, sha256)
    if (!isValid) {
      emitP2PBlobCacheEvent('cache-reject', {
        sha256,
        size: write.bytes.byteLength,
        videoId: write.videoId,
        variantUrl: write.variantUrl,
        source: write.source,
        reason: 'sha256-mismatch',
      })
      return null
    }

    const limit = await getP2PCacheLimitBytes()
    if (limit <= 0 || write.bytes.byteLength > limit) {
      emitP2PBlobCacheEvent('cache-skip', {
        sha256,
        size: write.bytes.byteLength,
        videoId: write.videoId,
        variantUrl: write.variantUrl,
        source: write.source,
        reason: limit <= 0 ? 'quota-unavailable' : 'blob-larger-than-limit',
      })
      return null
    }

    await this.ensureCacheSpace(write.bytes.byteLength, sha256, limit)

    try {
      return await this.writeEntry(sha256, write)
    } catch (error) {
      if (getQuotaExceededName(error) !== 'QuotaExceededError') throw error
      await this.evictLeastRecentlyUsed(sha256)
      return this.writeEntry(sha256, write)
    }
  }

  async delete(sha256: string): Promise<void> {
    if (!this.enabled()) return

    const normalizedHash = normalizeSha256(sha256)
    const entry = await this.getEntry(normalizedHash)
    const cache = await window.caches.open(CACHE_NAME)
    await cache.delete(createCacheUrl(normalizedHash))
    await this.deleteEntry(normalizedHash)

    emitP2PBlobCacheEvent('cache-evict', {
      sha256: normalizedHash,
      size: entry?.size,
      videoId: entry?.videoId,
      variantUrl: entry?.variantUrl,
      source: entry?.source,
    })
  }

  async clear(): Promise<void> {
    if (!this.enabled()) return

    await window.caches.delete(CACHE_NAME)
    const db = await this.getDb()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
    await transactionDone(transaction)
  }

  private async writeEntry(sha256: string, write: P2PBlobCacheWrite) {
    const now = Date.now()
    const existing = await this.getEntry(sha256)
    const cacheUrl = createCacheUrl(sha256)
    const entry: P2PBlobCacheEntry = {
      sha256,
      cacheUrl,
      size: write.bytes.byteLength,
      mimeType: write.mimeType,
      videoId: write.videoId,
      variantUrl: write.variantUrl,
      createdAt: existing?.createdAt ?? now,
      lastAccessedAt: now,
      accessCount: (existing?.accessCount ?? 0) + 1,
      source: write.source,
    }

    const response = new Response(bytesToArrayBuffer(write.bytes), {
      headers: write.mimeType ? { 'content-type': write.mimeType } : undefined,
    })
    const cache = await window.caches.open(CACHE_NAME)
    await cache.put(cacheUrl, response)
    await this.putEntry(entry)

    emitP2PBlobCacheEvent('cache-write', {
      sha256,
      size: entry.size,
      videoId: entry.videoId,
      variantUrl: entry.variantUrl,
      source: entry.source,
    })

    return entry
  }

  private async ensureCacheSpace(incomingBytes: number, protectedHash: string, limit: number) {
    let usage = await this.getTotalCachedBytes()
    let bytesToFree = usage + incomingBytes - limit

    while (bytesToFree > 0) {
      const victim = await this.getLeastRecentlyUsedEntry(protectedHash)
      if (!victim) break
      await this.delete(victim.sha256)
      usage -= victim.size
      bytesToFree = usage + incomingBytes - limit
    }
  }

  private async evictLeastRecentlyUsed(protectedHash: string) {
    const victim = await this.getLeastRecentlyUsedEntry(protectedHash)
    if (victim) {
      await this.delete(victim.sha256)
    }
  }

  private async getDb() {
    this.dbPromise ??= openMetadataDb()
    return this.dbPromise
  }

  private async getEntry(sha256: string): Promise<P2PBlobCacheEntry | undefined> {
    const db = await this.getDb()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    return requestToPromise<P2PBlobCacheEntry | undefined>(
      transaction.objectStore(STORE_NAME).get(sha256)
    )
  }

  private async putEntry(entry: P2PBlobCacheEntry): Promise<void> {
    const db = await this.getDb()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(entry)
    await transactionDone(transaction)
  }

  private async deleteEntry(sha256: string): Promise<void> {
    const db = await this.getDb()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(sha256)
    await transactionDone(transaction)
  }

  private async touch(sha256: string): Promise<void> {
    const entry = await this.getEntry(sha256)
    if (!entry) return

    await this.putEntry({
      ...entry,
      lastAccessedAt: Date.now(),
      accessCount: entry.accessCount + 1,
    })
  }

  private async getTotalCachedBytes(): Promise<number> {
    const entries = await this.getAllEntries()
    return entries.reduce((total, entry) => total + entry.size, 0)
  }

  private async getLeastRecentlyUsedEntry(
    protectedHash: string
  ): Promise<P2PBlobCacheEntry | undefined> {
    const entries = await this.getAllEntries()
    return entries
      .filter(entry => entry.sha256 !== protectedHash)
      .sort((a, b) => a.accessCount - b.accessCount || a.lastAccessedAt - b.lastAccessedAt)[0]
  }

  private async getAllEntries(): Promise<P2PBlobCacheEntry[]> {
    const db = await this.getDb()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    return requestToPromise<P2PBlobCacheEntry[]>(transaction.objectStore(STORE_NAME).getAll())
  }
}

export function getDefaultVerifiedBlobCache() {
  defaultCache ??= new VerifiedBlobCache()
  return defaultCache
}

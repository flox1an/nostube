import type { NostrEvent } from 'nostr-tools'
import type { ViewEventSource, ViewSegment } from './view-events'

const DB_NAME = 'nostube-view-event-outbox'
const DB_VERSION = 1
const STORE_NAME = 'viewEvents'

export type PendingViewEventStatus = 'pending' | 'publishing' | 'failed'

export interface PendingViewEvent {
  /** Equals the signed Nostr event id — deterministic, prevents duplicate rows. */
  id: string
  viewerPubkey: string
  videoId: string
  videoKind: number
  videoPubkey: string
  videoIdentifier?: string
  relayHint?: string
  source: ViewEventSource
  sourceDetail?: string
  segments: ViewSegment[]
  loopCount: number
  event: NostrEvent
  status: PendingViewEventStatus
  retryCount: number
  createdAt: number
  /** Updated on every status transition; used for backoff calculation. */
  updatedAt: number
}

export interface EnqueueViewEventOptions {
  viewerPubkey: string
  videoId: string
  videoKind: number
  videoPubkey: string
  videoIdentifier?: string
  relayHint?: string
  source: ViewEventSource
  sourceDetail?: string
  segments: ViewSegment[]
  loopCount?: number
  event: NostrEvent
}

// ─── IDB helpers ─────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
  dbPromise = promise

  const request = indexedDB.open(DB_NAME, DB_VERSION)

  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex('viewerPubkey_status', ['viewerPubkey', 'status'], { unique: false })
      store.createIndex('createdAt', 'createdAt', { unique: false })
      store.createIndex('videoId', 'videoId', { unique: false })
    }
  }

  request.onsuccess = () => resolve(request.result)
  request.onerror = () => {
    dbPromise = null
    reject(request.error ?? new Error('IDB open failed'))
  }

  return promise
}

/** Open a read-write transaction and return the store + a promise that settles on commit/abort. */
function idbTx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): { store: IDBObjectStore; done: Promise<void> } {
  const { promise: done, resolve, reject } = Promise.withResolvers<void>()
  const tx = db.transaction(STORE_NAME, mode)
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error ?? new Error('IDB transaction error'))
  tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'))
  return { store: tx.objectStore(STORE_NAME), done }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Enqueue a signed view event for durable delivery.
 * Idempotent: the row id is the Nostr event id, so a duplicate call with the
 * same signed event is silently ignored (IDB `put` upserts).
 */
export async function enqueueViewEvent(options: EnqueueViewEventOptions): Promise<void> {
  try {
    const db = await openDB()
    const now = Date.now()
    const pending: PendingViewEvent = {
      id: options.event.id,
      viewerPubkey: options.viewerPubkey,
      videoId: options.videoId,
      videoKind: options.videoKind,
      videoPubkey: options.videoPubkey,
      videoIdentifier: options.videoIdentifier,
      relayHint: options.relayHint,
      source: options.source,
      sourceDetail: options.sourceDetail,
      segments: options.segments,
      loopCount: options.loopCount ?? 0,
      event: options.event,
      status: 'pending',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    const { store, done } = idbTx(db, 'readwrite')
    store.put(pending)
    await done
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[view-event-outbox] Failed to enqueue view event:', error)
    }
  }
}

/**
 * Return all pending and failed rows for a user, ordered by createdAt.
 * Publishing rows are excluded — they are owned by an in-flight sweep.
 */
export async function getRetryableEvents(viewerPubkey: string): Promise<PendingViewEvent[]> {
  try {
    const db = await openDB()
    const { store, done } = idbTx(db, 'readonly')
    const results: PendingViewEvent[] = []
    // Range covers every status value for this user; filter publishing out below.
    const range = IDBKeyRange.bound([viewerPubkey, ''], [viewerPubkey, '\uffff'])
    const req = store.index('viewerPubkey_status').openCursor(range)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        // Safe cast: we wrote these rows from this module.
        const row = cursor.value as PendingViewEvent
        if (row.status === 'pending' || row.status === 'failed') results.push(row)
        cursor.continue()
      }
    }
    await done
    return results.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

/** Legacy helper kept for the admin debug panel; returns all rows, optionally filtered by user. */
export async function getPendingViewEvents(viewerPubkey?: string): Promise<PendingViewEvent[]> {
  try {
    const db = await openDB()
    const { store, done } = idbTx(db, 'readonly')
    const results: PendingViewEvent[] = []

    const req = viewerPubkey
      ? store
          .index('viewerPubkey_status')
          .openCursor(IDBKeyRange.bound([viewerPubkey, ''], [viewerPubkey, '\uffff']))
      : store.index('createdAt').openCursor(undefined, 'next')

    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        results.push(cursor.value as PendingViewEvent)
        cursor.continue()
      }
    }
    await done
    return results
  } catch {
    return []
  }
}

export async function markPublishing(id: string): Promise<void> {
  try {
    const db = await openDB()
    const { store, done } = idbTx(db, 'readwrite')
    const req = store.get(id)
    req.onsuccess = () => {
      if (req.result) {
        const updated: PendingViewEvent = {
          ...(req.result as PendingViewEvent),
          status: 'publishing',
          updatedAt: Date.now(),
        }
        store.put(updated)
      }
    }
    await done
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[view-event-outbox] markPublishing failed:', error)
  }
}

export async function markFailed(id: string, error: string): Promise<void> {
  try {
    const db = await openDB()
    const { store, done } = idbTx(db, 'readwrite')
    const req = store.get(id)
    req.onsuccess = () => {
      if (req.result) {
        const row = req.result as PendingViewEvent
        const updated: PendingViewEvent = {
          ...row,
          status: 'failed',
          retryCount: row.retryCount + 1,
          updatedAt: Date.now(),
        }
        store.put(updated)
        if (import.meta.env.DEV) {
          console.warn(
            `[view-event-outbox] View event ${id} failed (attempt ${updated.retryCount}):`,
            error
          )
        }
      }
    }
    await done
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[view-event-outbox] markFailed write failed:', err)
  }
}

export async function deleteById(id: string): Promise<void> {
  try {
    const db = await openDB()
    const { store, done } = idbTx(db, 'readwrite')
    store.delete(id)
    await done
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[view-event-outbox] deleteById failed:', error)
  }
}

/**
 * Reset any rows stuck in `publishing` back to `pending`.
 * Call on app startup to recover from a crash that occurred mid-publish.
 */
export async function resetPublishingToPending(viewerPubkey: string): Promise<void> {
  try {
    const db = await openDB()
    const { store, done } = idbTx(db, 'readwrite')
    const range = IDBKeyRange.only([viewerPubkey, 'publishing'])
    const req = store.index('viewerPubkey_status').openCursor(range)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        const updated: PendingViewEvent = {
          ...(cursor.value as PendingViewEvent),
          status: 'pending',
          updatedAt: Date.now(),
        }
        cursor.update(updated)
        cursor.continue()
      }
    }
    await done
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[view-event-outbox] resetPublishingToPending failed:', error)
    }
  }
}

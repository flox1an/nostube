import type { NostrEvent } from 'nostr-tools'
import type { ViewEventSource, ViewSegment } from './view-events'

const DB_NAME = 'nostube-view-event-outbox'
const DB_VERSION = 1
const STORE_NAME = 'viewEvents'

export type PendingViewEventStatus = 'pending'

export interface PendingViewEvent {
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

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
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
      reject(request.error)
    }
  })

  return dbPromise
}

function createPendingViewEventId(viewerPubkey: string, videoId: string, createdAt: number) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${videoId}_${viewerPubkey}_${createdAt}_${random}`
}

export async function enqueueViewEvent(options: EnqueueViewEventOptions): Promise<void> {
  try {
    const db = await openDB()
    const now = Date.now()
    const pending: PendingViewEvent = {
      id: createPendingViewEventId(options.viewerPubkey, options.videoId, now),
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

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(pending)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[view-event-outbox] Failed to enqueue view event:', error)
    }
  }
}

export async function getPendingViewEvents(viewerPubkey?: string): Promise<PendingViewEvent[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const results: PendingViewEvent[] = []

      const request = viewerPubkey
        ? store
            .index('viewerPubkey_status')
            .openCursor(IDBKeyRange.only([viewerPubkey, 'pending']), 'next')
        : store.index('createdAt').openCursor(undefined, 'next')

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const event = cursor.value as PendingViewEvent
          if (!viewerPubkey || event.status === 'pending') results.push(event)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve(results)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return []
  }
}

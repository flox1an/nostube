import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBrowserCacheData } from './cache-clear'

describe('clearBrowserCacheData', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes only the cache databases and keeps user data and the SW precache', async () => {
    const deleted: string[] = []
    const deleteDatabase = vi.fn((name: string) => {
      deleted.push(name)
      const request = {} as IDBOpenDBRequest
      queueMicrotask(() => request.onsuccess?.(new Event('success')))
      return request
    })
    const databases = vi.fn()
    vi.stubGlobal('indexedDB', { deleteDatabase, databases })
    const cachesDelete = vi.fn()
    vi.stubGlobal('caches', { keys: vi.fn(), delete: cachesDelete })

    expect(await clearBrowserCacheData()).toBe(true)

    expect(deleted.sort()).toEqual([
      'nostr-idb',
      'nostube-playlist-validation',
      'nostube-trust-scores',
    ])
    expect(deleted).not.toContain('nostube-play-positions')
    expect(deleted).not.toContain('nostube-view-event-outbox')
    expect(databases).not.toHaveBeenCalled()
    expect(cachesDelete).not.toHaveBeenCalled()
  })
})

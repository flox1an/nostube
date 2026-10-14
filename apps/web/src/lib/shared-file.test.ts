import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHARED_FILE_CACHE, SHARED_FILE_KEY, takeSharedFile } from './shared-file'

// Minimal Cache API: one named cache keyed by URL string. match() hands the body out as a
// jsdom Blob: on Node 22, Response.blob() yields Node's Blob, which jsdom's File stringifies.
function fakeCaches() {
  const entries = new Map<string, Response>()
  const cache = {
    put: async (key: string, response: Response) => void entries.set(key, response),
    match: async (key: string) => {
      const response = entries.get(key)?.clone()
      if (!response) return undefined
      const body = await response.arrayBuffer()
      const type = response.headers.get('Content-Type') ?? ''
      return { headers: response.headers, blob: async () => new Blob([body], { type }) }
    },
    delete: async (key: string) => entries.delete(key),
  }
  const open = vi.fn(async (name: string) => {
    expect(name).toBe(SHARED_FILE_CACHE)
    return cache
  })
  vi.stubGlobal('caches', { open })
  return cache
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('takeSharedFile', () => {
  it('returns the video stored by the share target worker, once', async () => {
    const cache = fakeCaches()
    // Same shape as public/share-target-sw.js writes.
    await cache.put(
      SHARED_FILE_KEY,
      new Response('video-bytes', {
        headers: {
          'Content-Type': 'video/mp4',
          'X-File-Name': encodeURIComponent('My clip ü.mp4'),
        },
      })
    )

    const file = await takeSharedFile()
    expect(file).toBeInstanceOf(File)
    expect(file?.name).toBe('My clip ü.mp4')
    expect(file?.type).toBe('video/mp4')
    expect(await file?.text()).toBe('video-bytes')

    expect(await takeSharedFile()).toBeNull()
  })

  it('returns null when nothing was shared', async () => {
    fakeCaches()
    expect(await takeSharedFile()).toBeNull()
  })

  it('returns null without the Cache API', async () => {
    expect(await takeSharedFile()).toBeNull()
  })
})

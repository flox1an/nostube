import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmMediaMirrors, waitForMirrors, waitForRestart } from './api'

// A health request can hang while the instance is offline. Its abort signal must
// release the polling loop so the overall restart deadline can still expire.
afterEach(() => vi.unstubAllGlobals())

describe('waitForRestart', () => {
  it('returns false within its deadline even when health never responds', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, { signal }: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
        })
    )
    expect(await waitForRestart('old', { intervalMs: 1, timeoutMs: 40 })).toBe(false)
  }, 1000)

  it('ignores the old process and succeeds only when a new boot answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ boot: 'old' })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ boot: 'new' })))
    )
    expect(await waitForRestart('old', { intervalMs: 1, timeoutMs: 1000 })).toBe(true)
  })
})

describe('confirmed media mirrors', () => {
  it('does not accept partial URLs or a reply not marked ready', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ready: false,
            urls: { video: 'https://mirror.example/video' },
            error: null,
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ready: false,
            urls: { video: 'https://mirror.example/video', thumb: 'https://mirror.example/thumb' },
            error: null,
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ready: true,
            urls: { video: 'https://mirror.example/video', thumb: 'https://mirror.example/thumb' },
            error: null,
          })
        )
      )
    vi.stubGlobal('fetch', fetch)
    const progress = vi.fn()
    expect(
      await waitForMirrors(['video', 'thumb', 'video'], progress, undefined, { intervalMs: 1 })
    ).toEqual({
      video: 'https://mirror.example/video',
      thumb: 'https://mirror.example/thumb',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ hashes: ['video', 'thumb'] })
    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
      [2, 2],
    ])
  })

  it('surfaces a mirror failure instead of publishing with partial URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ready: false,
              urls: {},
              error: 'hash mismatch',
            })
          )
      )
    )
    await expect(waitForMirrors(['video'], () => {})).rejects.toThrow('hash mismatch')
  })

  it('cancels while waiting for a mirror rather than leaving the upload running', async () => {
    const abort = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ready: false,
              urls: {},
              error: null,
            })
          )
      )
    )
    const result = waitForMirrors(
      ['video'],
      () => abort.abort(new Error('cancelled')),
      abort.signal
    )
    await expect(result).rejects.toThrow('cancelled')
  })

  it('passes cancellation to an in-flight mirror request', async () => {
    const abort = new AbortController()
    const fetch = vi.fn(
      async (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
            once: true,
          })
        })
    )
    vi.stubGlobal('fetch', fetch)
    const result = confirmMediaMirrors(['video'], abort.signal)
    abort.abort(new Error('cancelled'))
    await expect(result).rejects.toThrow('cancelled')
  })
})

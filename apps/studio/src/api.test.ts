import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForRestart } from './api'

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

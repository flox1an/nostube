import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast }))

import { beginUploadWork, hasActiveUploadWork, reloadForStaleChunk } from './active-work'

const STALE_CHUNK = 'Failed to fetch dynamically imported module: https://x/assets/VideoPage-abc.js'
const reload = vi.fn()

beforeEach(() => {
  vi.stubGlobal('location', { reload })
  sessionStorage.clear()
  reload.mockClear()
  toast.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('reloadForStaleChunk', () => {
  it('does not reload during an active job and shows a reload-now notice instead', () => {
    const endWork = beginUploadWork()
    expect(hasActiveUploadWork()).toBe(true)

    reloadForStaleChunk(STALE_CHUNK)

    expect(reload).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(1)
    const [, options] = toast.mock.calls[0]
    options.action.onClick()
    expect(reload).toHaveBeenCalledTimes(1)

    endWork()
    expect(hasActiveUploadWork()).toBe(false)
  })

  it('without work reloads silently, rate-limited by the loop guard', () => {
    reloadForStaleChunk(STALE_CHUNK)
    reloadForStaleChunk(STALE_CHUNK)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(toast).not.toHaveBeenCalled()
  })

  it('ignores unrelated errors', () => {
    reloadForStaleChunk('TypeError: x is undefined')
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('wake lock', () => {
  it('is held while work runs, re-acquired when visible again, released when done', async () => {
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    const sentinels: { released: boolean; release: () => Promise<void> }[] = []
    const request = vi.fn(async () => {
      const sentinel = {
        released: false,
        release: vi.fn(async () => {
          sentinel.released = true
        }),
      }
      sentinels.push(sentinel)
      return sentinel
    })
    vi.stubGlobal('navigator', { wakeLock: { request } })

    const endWork = beginUploadWork()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    // Browser drops the lock when the page is hidden
    visibility = 'hidden'
    sentinels[0].released = true
    document.dispatchEvent(new Event('visibilitychange'))
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))

    endWork()
    await vi.waitFor(() => expect(sentinels[1].release).toHaveBeenCalled())
  })

  it('ignores a denied request', async () => {
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    })
    const endWork = beginUploadWork()
    await Promise.resolve()
    endWork()
    expect(hasActiveUploadWork()).toBe(false)
  })
})

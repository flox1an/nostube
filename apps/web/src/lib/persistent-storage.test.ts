import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persistent-storage'

function stub(standalone: boolean, persisted = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: standalone }))
  )
  const persist = vi.fn().mockResolvedValue(true)
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persisted: vi.fn().mockResolvedValue(persisted), persist },
  })
  return persist
}

describe('requestPersistentStorage', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('requests once per session in standalone mode', async () => {
    const persist = stub(true)
    await requestPersistentStorage()
    await requestPersistentStorage()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('never requests in a normal tab or when already persistent', async () => {
    const persist = stub(false)
    await requestPersistentStorage()
    expect(persist).not.toHaveBeenCalled()

    const persistAlready = stub(true, true)
    await requestPersistentStorage()
    expect(persistAlready).not.toHaveBeenCalled()
  })

  it('is silent without the Storage API', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    )
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined })
    await expect(requestPersistentStorage()).resolves.toBeUndefined()
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from './random-uuid'

afterEach(() => vi.unstubAllGlobals())

it('preserves random bytes and sets UUID v4 version/variant without crypto.randomUUID', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => {
      for (let i = 0; i < bytes.length; i++) bytes[i] = 0xf0 + i
      return bytes
    },
  })

  expect(randomUUID()).toBe('f0f1f2f3-f4f5-46f7-b8f9-fafbfcfdfeff')
})

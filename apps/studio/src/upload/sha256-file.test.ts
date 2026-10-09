// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256File } from './sha256-file'

const reference = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('sha256File', () => {
  it('matches the reference hash of an empty file and of a small one', async () => {
    expect(await sha256File(new Blob([]))).toBe(reference(new Uint8Array()))
    const small = new TextEncoder().encode('hello nostube')
    expect(await sha256File(new Blob([small]))).toBe(reference(small))
  })

  it('matches across the piece boundaries of a larger file', async () => {
    const big = new Uint8Array(9 * 1024 * 1024 + 123).map((_, i) => (i * 31) % 251)
    const seen: number[] = []
    const hash = await sha256File(new Blob([big]), done => seen.push(done))
    expect(hash).toBe(reference(big))
    expect(seen[seen.length - 1]).toBe(big.length)
    expect(seen.length).toBeGreaterThanOrEqual(3)
  })

  it('stops when asked to', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      sha256File(new Blob([new Uint8Array(10)]), undefined, controller.signal)
    ).rejects.toThrow()
  })
})

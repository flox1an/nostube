import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlossomAuthorization, type Signer } from './blossom-auth'

const sha256 = 'a'.repeat(64)

function createSigner() {
  const signer = vi.fn<Signer>(async draft => ({
    ...draft,
    id: 'event-id',
    pubkey: 'pubkey',
    sig: 'signature',
  }))

  return signer
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createBlossomAuthorization', () => {
  it('creates a server-scoped upload authorization event', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'))
    const signer = createSigner()

    const event = await createBlossomAuthorization(signer, 'upload', sha256, 'cdn.example.com')

    expect(signer).toHaveBeenCalledWith({
      kind: 24242,
      created_at: 1783771200,
      content: 'Upload Blob',
      tags: [
        ['t', 'upload'],
        ['expiration', '1783774800'],
        ['x', sha256],
        ['server', 'cdn.example.com'],
      ],
    })
    expect(event).toMatchObject({ id: 'event-id', pubkey: 'pubkey', sig: 'signature' })
  })

  it('creates a delete authorization event without a server scope', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T12:00:00Z'))
    const signer = createSigner()

    await createBlossomAuthorization(signer, 'delete', sha256)

    expect(signer).toHaveBeenCalledWith({
      kind: 24242,
      created_at: 1783771200,
      content: 'Delete Blob',
      tags: [
        ['t', 'delete'],
        ['expiration', '1783774800'],
        ['x', sha256],
      ],
    })
  })
})

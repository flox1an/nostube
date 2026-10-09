import { describe, expect, it } from 'vitest'
import { findSigner, nip07Signer } from './signer'

const KEY = 'a'.repeat(64)
const extension = (key: unknown = KEY) => ({
  getPublicKey: async () => key as string,
  signEvent: async (event: object) => ({ ...event, id: 'i', pubkey: KEY, sig: 's' }) as never,
})

describe('nip07Signer', () => {
  it('is null without an extension', () => {
    expect(nip07Signer({})).toBeNull()
  })

  it('returns the public key and signs through the extension', async () => {
    const signer = nip07Signer({ nostr: extension() })!
    expect(await signer.getPublicKey()).toBe(KEY)
    const signed = await signer.signEvent({ kind: 1, created_at: 1, tags: [], content: 'x' })
    expect(signed.sig).toBe('s')
  })

  it('rejects a public key that is not 64 hex digits', async () => {
    const signer = nip07Signer({ nostr: extension('npub1nothex') })!
    await expect(signer.getPublicKey()).rejects.toThrow(/not a public key/)
  })
})

describe('findSigner', () => {
  it('waits for an extension that arrives late', async () => {
    const win: { nostr?: ReturnType<typeof extension> } = {}
    setTimeout(() => (win.nostr = extension()), 60)
    expect(await findSigner(win, { waitMs: 1000, stepMs: 20 })).not.toBeNull()
  })

  it('gives up after the wait', async () => {
    const started = Date.now()
    expect(await findSigner({}, { waitMs: 80, stepMs: 20 })).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })
})

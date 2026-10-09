// @vitest-environment node
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools'
import { describe, expect, it } from 'vitest'
import type { Signer } from '../signer'
import { signChecked } from './sign'

const template: EventTemplate = { kind: 1, created_at: 1_700_000_000, tags: [], content: 'hi' }
const secret = generateSecretKey()
const pubkey = getPublicKey(secret)
const signerFor = (sign: Signer['signEvent']): Signer => ({
  getPublicKey: async () => pubkey,
  signEvent: sign,
})

describe('signChecked', () => {
  it('returns a validly signed event of the connected key', async () => {
    const signed = await signChecked(
      signerFor(async t => finalizeEvent(t, secret)),
      template,
      pubkey
    )
    expect(signed.pubkey).toBe(pubkey)
  })

  it('refuses a signature that does not verify', async () => {
    const forged = signerFor(async t => ({ ...finalizeEvent(t, secret), sig: 'f'.repeat(128) }))
    await expect(signChecked(forged, template, pubkey)).rejects.toThrow(/invalid signature/)
  })

  it('refuses an event signed by another key', async () => {
    const other = generateSecretKey()
    const signer = signerFor(async t => finalizeEvent(t, other))
    await expect(signChecked(signer, template, pubkey)).rejects.toThrow(/different key/)
  })
})

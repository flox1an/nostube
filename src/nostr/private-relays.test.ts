import type { ISigner } from 'applesauce-signers'
import type { PublishResponse, RelayPool } from 'applesauce-relay'
import { BehaviorSubject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import {
  createPrivateRelayListEvent,
  decryptPrivateRelayList,
  normalizePrivateRelayUrls,
  monitorPrivateRelayAuthentication,
  PRIVATE_RELAY_LIST_KIND,
  publishPrivateEvent,
} from './private-relays'

const PRIVATE_RELAYS = ['wss://private-one.example', 'wss://private-two.example']

function createSigner(): ISigner {
  const pubkey = 'a'.repeat(64)
  return {
    getPublicKey: async () => pubkey,
    signEvent: async template => ({
      ...template,
      pubkey,
      id: 'b'.repeat(64),
      sig: 'c'.repeat(128),
    }),
    nip44: {
      encrypt: async (_recipient, plaintext) => btoa(plaintext),
      decrypt: async (_sender, ciphertext) => atob(ciphertext),
    },
  }
}

describe('private relay lists', () => {
  it('normalizes, validates, and deduplicates private relay URLs', () => {
    expect(
      normalizePrivateRelayUrls([
        'private-one.example/',
        'wss://private-one.example',
        'ws://localhost:7000/',
        'https://not-a-relay.example',
        'not a url',
      ])
    ).toEqual(['wss://private-one.example', 'ws://localhost:7000'])
  })

  it('stores relay URLs only inside a self-encrypted kind 10013 payload', async () => {
    const signer = createSigner()
    const pubkey = await signer.getPublicKey()
    const event = await createPrivateRelayListEvent(signer, pubkey, PRIVATE_RELAYS)

    expect(event.kind).toBe(PRIVATE_RELAY_LIST_KIND)
    expect(event.tags).toEqual([])
    expect(event.content).not.toContain('private-one.example')
    await expect(decryptPrivateRelayList(signer, pubkey, event)).resolves.toEqual(PRIVATE_RELAYS)
  })
})

describe('private event publishing', () => {
  it('publishes only to the explicit private relay set', async () => {
    const signer = createSigner()
    const event = await signer.signEvent({
      kind: 30078,
      created_at: 1,
      tags: [],
      content: 'encrypted',
    })
    const publish = vi
      .fn<RelayPool['publish']>()
      .mockResolvedValue(PRIVATE_RELAYS.map(from => ({ ok: true, from })))

    await publishPrivateEvent({ publish }, PRIVATE_RELAYS, event)

    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith(PRIVATE_RELAYS, event)
  })

  it('never falls back when no private relay is configured', async () => {
    const signer = createSigner()
    const event = await signer.signEvent({
      kind: 30078,
      created_at: 1,
      tags: [],
      content: 'encrypted',
    })
    const publish = vi.fn<RelayPool['publish']>()

    await expect(publishPrivateEvent({ publish }, [], event)).rejects.toThrow(
      'Configure at least one private relay'
    )
    expect(publish).not.toHaveBeenCalled()
  })

  it('fails when every private relay rejects the event', async () => {
    const signer = createSigner()
    const event = await signer.signEvent({
      kind: 30078,
      created_at: 1,
      tags: [],
      content: 'encrypted',
    })
    const publish = vi
      .fn<RelayPool['publish']>()
      .mockResolvedValue([
        { ok: false, from: PRIVATE_RELAYS[0], message: 'auth-required: sign in' },
      ])

    await expect(publishPrivateEvent({ publish }, PRIVATE_RELAYS, event)).rejects.toThrow(
      'auth-required: sign in'
    )
  })
})

describe('private relay authentication', () => {
  it('answers NIP-42 challenges with the active signer', async () => {
    const signer = createSigner()
    const pubkey = await signer.getPublicKey()
    const connected = new BehaviorSubject(false)
    const authenticatedAs = new BehaviorSubject<string | null>(null)
    const challenge = new BehaviorSubject<string | null>(null)
    let currentAuthenticatedPubkey: string | null = null
    const authenticate = vi.fn(async (): Promise<PublishResponse> => {
      currentAuthenticatedPubkey = pubkey
      authenticatedAs.next(pubkey)
      return { ok: true, from: PRIVATE_RELAYS[0] }
    })
    const relay = {
      connected$: connected,
      authenticatedAs$: authenticatedAs,
      challenge$: challenge,
      get authenticatedAs() {
        return currentAuthenticatedPubkey
      },
      authenticate,
    }
    const statuses: string[] = []
    const stop = monitorPrivateRelayAuthentication(
      { relay: () => relay },
      [PRIVATE_RELAYS[0]],
      signer,
      pubkey,
      (_url, status) => statuses.push(status)
    )

    connected.next(true)
    challenge.next('relay-challenge')
    await vi.waitFor(() => expect(authenticate).toHaveBeenCalledWith(signer))
    await vi.waitFor(() => expect(statuses).toContain('authenticated'))

    stop()
    challenge.next('another-challenge')
    expect(authenticate).toHaveBeenCalledOnce()
  })
})

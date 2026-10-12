// @vitest-environment node
// jsdom's Uint8Array realm breaks the real NIP-44 crypto the bunker round trip needs.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { matchFilters, nip19, type Filter, type NostrEvent } from 'nostr-tools'
import { Subject, filter } from 'rxjs'
import { NostrConnectAccount, SimpleAccount } from 'applesauce-accounts/accounts'
import { AccountManager } from 'applesauce-accounts'
import {
  NostrConnectProvider,
  NostrConnectSigner,
  PrivateKeySigner,
  SimpleSigner,
} from 'applesauce-signers'
import {
  loadActiveAccount,
  restoreAccountsToManager,
  saveAccountToStorage,
  saveActiveAccount,
} from './useAccountPersistence'

const privateKey = Uint8Array.from([
  0x35, 0x01, 0x45, 0x41, 0x35, 0x01, 0x45, 0x41, 0x35, 0x01, 0x45, 0x41, 0x35, 0x01, 0x45, 0x3f,
  0xef, 0xb0, 0x22, 0x27, 0xe4, 0x49, 0xe5, 0x7c, 0xf4, 0xd3, 0xa3, 0xce, 0x05, 0x37, 0x86, 0x83,
])
const nsec = nip19.nsecEncode(privateKey)

describe('account persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('restores an active nsec account during the same browser session', async () => {
    const signer = new SimpleSigner(privateKey)
    const pubkey = await signer.getPublicKey()
    const account = new SimpleAccount(pubkey, signer)
    const manager = new AccountManager()

    saveAccountToStorage(account, 'nsec', nsec)
    saveActiveAccount(pubkey)

    await restoreAccountsToManager(manager)

    expect(manager.getActive()?.pubkey).toBe(pubkey)
    expect(loadActiveAccount()).toBe(pubkey)
  })

  describe('bunker accounts', () => {
    // In-memory relay standing in for the NIP-46 relays.
    const relay = new Subject<NostrEvent>()
    const subscriptionMethod = (_relays: string[], filters: Filter[]) =>
      relay.pipe(filter(event => matchFilters(filters, event)))
    const publishMethod = async (_relays: string[], event: NostrEvent) => relay.next(event)

    beforeEach(() => {
      // The host apps wire the NIP-46 transport through these statics.
      NostrConnectSigner.subscriptionMethod = subscriptionMethod
      NostrConnectSigner.publishMethod = publishMethod
    })
    afterEach(() => {
      NostrConnectSigner.subscriptionMethod = undefined
      NostrConnectSigner.publishMethod = undefined
    })

    it('survives a reload without a new handshake and signs through the remote signer', async () => {
      const user = new PrivateKeySigner(privateKey)
      const userPubkey = await user.getPublicKey()
      let connects = 0
      const remoteSigner = new NostrConnectProvider({
        relays: ['wss://bunker.example'],
        upstream: user,
        bunkerSecret: 'single-use',
        subscriptionMethod,
        publishMethod,
        // Like real remote signers: the bunker secret authorizes exactly one handshake.
        onConnect: () => ++connects === 1,
      })
      await remoteSigner.start()
      const bunkerUri = await remoteSigner.getBunkerURI()

      const loginSigner = await NostrConnectSigner.fromBunkerURI(bunkerUri)
      const account = new NostrConnectAccount(await loginSigner.getPublicKey(), loginSigner)
      saveAccountToStorage(account, 'bunker', bunkerUri)
      saveActiveAccount(account.pubkey)
      await loginSigner.close() // page unload

      const manager = new AccountManager()
      await restoreAccountsToManager(manager)

      const active = manager.getActive()
      expect(active?.pubkey).toBe(userPubkey)
      const signed = await active!.signEvent({ kind: 1, content: 'hi', tags: [], created_at: 0 })
      expect(signed.pubkey).toBe(userPubkey)
      expect(connects).toBe(1)
      await remoteSigner.stop()
    })
  })
})

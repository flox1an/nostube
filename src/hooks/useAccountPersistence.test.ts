import { describe, expect, it, beforeEach } from 'vitest'
import { nip19 } from 'nostr-tools'
import { SimpleAccount } from 'applesauce-accounts/accounts'
import { AccountManager } from 'applesauce-accounts'
import { SimpleSigner } from 'applesauce-signers'
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
})

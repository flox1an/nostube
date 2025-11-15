import { useContext } from 'react'
import { AccountsContext } from 'applesauce-react'
import { ExtensionAccount, NostrConnectAccount, SimpleAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner, NostrConnectSigner, SimpleSigner } from 'applesauce-signers'
import { nip19 } from 'nostr-tools'
import { saveAccountToStorage, saveActiveAccount } from '@/hooks/useAccountPersistence'

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const accountManager = useContext(AccountsContext)

  if (!accountManager) {
    throw new Error('useLoginActions must be used within AccountsProvider')
  }

  return {
    // Login with a Nostr secret key
    async nsec(_nsec: string): Promise<void> {
      try {
        // Validate and decode nsec
        if (!_nsec.trim()) {
          throw new Error('Nsec cannot be empty')
        }

        let decodedKey: Uint8Array
        try {
          const decoded = nip19.decode(_nsec)
          if (decoded.type !== 'nsec') {
            throw new Error('Invalid nsec format')
          }
          decodedKey = decoded.data
        } catch {
          throw new Error('Failed to decode nsec. Please check the format.')
        }

        const signer = new SimpleSigner(decodedKey)
        const pubkey = await signer.getPublicKey()
        const account = new SimpleAccount(pubkey, signer)

        await accountManager.addAccount(account)
        accountManager.setActive(account)

        // Persist account (without nsec for security)
        saveAccountToStorage(account, 'nsec')
        saveActiveAccount(pubkey)
      } catch (error) {
        console.error('Nsec login failed:', error)
        throw error
      }
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(_uri: string): Promise<void> {
      try {
        if (!_uri.trim()) {
          throw new Error('Bunker URI cannot be empty')
        }

        if (!_uri.startsWith('bunker://')) {
          throw new Error('Bunker URI must start with bunker://')
        }

        // Use fromBunkerURI if available (from useCurrentUser example)
        const signer = await NostrConnectSigner.fromBunkerURI(_uri)
        const pubkey = await signer.getPublicKey()
        const account = new NostrConnectAccount(pubkey, signer)

        await accountManager.addAccount(account)
        accountManager.setActive(account)

        // Persist account with bunker URI
        saveAccountToStorage(account, 'bunker', _uri)
        saveActiveAccount(pubkey)
      } catch (error) {
        console.error('Bunker login failed:', error)
        throw error
      }
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      try {
        if (!('nostr' in window) || !window.nostr) {
          throw new Error('Nostr extension not found. Please install a NIP-07 extension.')
        }

        const signer = new ExtensionSigner()
        const pubkey = await signer.getPublicKey()
        const account = new ExtensionAccount(pubkey, signer)

        await accountManager.addAccount(account)
        accountManager.setActive(account)

        // Persist extension account
        saveAccountToStorage(account, 'extension')
        saveActiveAccount(pubkey)
      } catch (error) {
        console.error('Extension login failed:', error)
        throw error
      }
    },
    async logout(): Promise<void> {
      accountManager.clearActive()
      saveActiveAccount(null)
    },
  }
}

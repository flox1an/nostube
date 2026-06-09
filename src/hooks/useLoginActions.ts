import { useContext } from 'react'
import { AccountsContext } from 'applesauce-react'
import { ExtensionAccount, NostrConnectAccount, SimpleAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner, NostrConnectSigner, SimpleSigner } from 'applesauce-signers'
import { nip19 } from 'nostr-tools'
import { saveAccountToStorage, saveActiveAccount } from '@/hooks/useAccountPersistence'
import { isNip05, resolveNip05ToBunkerUri } from '@/lib/nip05-bunker'
import { decryptNcryptsec } from '@/lib/nip49'

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
    // Login with a NIP-49 password-protected secret key
    async ncryptsec(_ncryptsec: string, password: string): Promise<void> {
      try {
        if (!_ncryptsec.trim()) {
          throw new Error('Encrypted key cannot be empty')
        }

        const { privateKey } = await decryptNcryptsec(_ncryptsec, password)
        const signer = new SimpleSigner(privateKey)
        const pubkey = await signer.getPublicKey()
        const account = new SimpleAccount(pubkey, signer)

        await accountManager.addAccount(account)
        accountManager.setActive(account)

        saveAccountToStorage(account, 'nsec')
        saveActiveAccount(pubkey)
      } catch (error) {
        console.error('Encrypted key login failed:', error)
        throw error
      }
    },
    // Login with a NIP-46 "bunker://" URI or NIP-05 address (user@domain)
    async bunker(
      _input: string,
      options?: { onAuth?: (url: string) => Promise<void> }
    ): Promise<void> {
      try {
        if (!_input.trim()) {
          throw new Error('Bunker URI cannot be empty')
        }

        let bunkerUri: string

        if (isNip05(_input)) {
          // Resolve NIP-05 address to bunker URI
          const result = await resolveNip05ToBunkerUri(_input)
          bunkerUri = result.bunkerUri
        } else if (_input.startsWith('bunker://')) {
          bunkerUri = _input
        } else {
          throw new Error('Enter a bunker:// URI or NIP-05 address (user@domain)')
        }

        const signer = await NostrConnectSigner.fromBunkerURI(bunkerUri, {
          onAuth: options?.onAuth,
        })
        const pubkey = await signer.getPublicKey()
        const account = new NostrConnectAccount(pubkey, signer)

        await accountManager.addAccount(account)
        accountManager.setActive(account)

        // Persist account with bunker URI
        saveAccountToStorage(account, 'bunker', bunkerUri)
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

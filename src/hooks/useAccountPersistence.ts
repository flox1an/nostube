import type { IAccount } from 'applesauce-accounts'
import { type AccountManager } from 'applesauce-accounts'
import { ExtensionAccount, NostrConnectAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner, NostrConnectSigner, PrivateKeySigner } from 'applesauce-signers'
import { bytesToHex } from '@noble/hashes/utils'

const STORAGE_KEY_ACCOUNTS = 'nostr:accounts'
const STORAGE_KEY_ACTIVE = 'nostr:active-account'

export type AccountMethod = 'extension' | 'nsec' | 'bunker'

export interface PersistedAccount {
  pubkey: string
  method: AccountMethod
  data?: string // nsec (for nsec accounts) or bunker URI (for bunker accounts)
  clientKey?: string // hex encoded client private key for bunker
  createdAt: number
}

/**
 * Save account data to localStorage
 * For security: nsec keys are NOT stored by default (only pubkey)
 */
export function saveAccountToStorage(
  account: IAccount,
  method: AccountMethod,
  data?: string
): void {
  try {
    const accounts = loadAccountsFromStorage()

    // Find if account already exists
    const existingIndex = accounts.findIndex(acc => acc.pubkey === account.pubkey)

    const accountData: PersistedAccount = {
      pubkey: account.pubkey,
      method,
      data: method === 'nsec' ? undefined : data, // Don't store nsec for security
      createdAt: existingIndex >= 0 ? accounts[existingIndex].createdAt : Date.now(),
    }

    // Store client key for bunker accounts so the session can be restored
    if (method === 'bunker' && account.signer instanceof NostrConnectSigner) {
      accountData.clientKey = bytesToHex(account.signer.signer.key)
    }

    if (existingIndex >= 0) {
      accounts[existingIndex] = accountData
    } else {
      accounts.push(accountData)
    }

    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts))
  } catch (error) {
    console.error('Failed to save account to storage:', error)
    // Handle quota exceeded or other storage errors
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded. Consider removing old accounts.')
    }
  }
}

/**
 * Load all persisted accounts from localStorage
 */
export function loadAccountsFromStorage(): PersistedAccount[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ACCOUNTS)
    if (!stored) return []

    const accounts = JSON.parse(stored) as PersistedAccount[]
    return Array.isArray(accounts) ? accounts : []
  } catch (error) {
    console.error('Failed to load accounts from storage:', error)
    // Clear corrupted data
    localStorage.removeItem(STORAGE_KEY_ACCOUNTS)
    return []
  }
}

/**
 * Save the active account pubkey
 */
export function saveActiveAccount(pubkey: string | null): void {
  try {
    if (pubkey) {
      localStorage.setItem(STORAGE_KEY_ACTIVE, pubkey)
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE)
    }
  } catch (error) {
    console.error('Failed to save active account:', error)
  }
}

/**
 * Load the active account pubkey
 */
export function loadActiveAccount(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE)
  } catch (error) {
    console.error('Failed to load active account:', error)
    return null
  }
}

/**
 * Remove an account from storage
 */
export function removeAccountFromStorage(pubkey: string): void {
  try {
    const accounts = loadAccountsFromStorage()
    const filtered = accounts.filter(acc => acc.pubkey !== pubkey)
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(filtered))

    // If removing active account, clear active
    const active = loadActiveAccount()
    if (active === pubkey) {
      saveActiveAccount(null)
    }
  } catch (error) {
    console.error('Failed to remove account from storage:', error)
  }
}

/**
 * Check if extension is available
 */
export function canRestoreExtensionAccount(): boolean {
  return typeof window !== 'undefined' && 'nostr' in window && window.nostr !== undefined
}

/**
 * Wait for extension to become available (with timeout)
 */
export function waitForExtension(timeoutMs: number = 3000): Promise<boolean> {
  return new Promise(resolve => {
    // Already available
    if (canRestoreExtensionAccount()) {
      resolve(true)
      return
    }

    const startTime = Date.now()
    const checkInterval = 100 // Check every 100ms

    const check = () => {
      if (canRestoreExtensionAccount()) {
        resolve(true)
        return
      }

      if (Date.now() - startTime >= timeoutMs) {
        resolve(false)
        return
      }

      setTimeout(check, checkInterval)
    }

    check()
  })
}

/**
 * Restore a single account from persisted data
 * @param accountData The persisted account data
 * @param skipExtensionWait If true, don't wait for extension (for faster initial check)
 */
export async function restoreAccount(
  accountData: PersistedAccount,
  skipExtensionWait: boolean = false
): Promise<IAccount | null> {
  try {
    switch (accountData.method) {
      case 'extension': {
        // Wait for extension if not skipping and not already available
        if (!skipExtensionWait && !canRestoreExtensionAccount()) {
          const extensionReady = await waitForExtension(3000)
          if (!extensionReady) {
            console.warn('Extension not available after waiting, cannot restore extension account')
            return null
          }
        } else if (skipExtensionWait && !canRestoreExtensionAccount()) {
          console.warn('Extension not available, cannot restore extension account')
          return null
        }
        const signer = new ExtensionSigner()
        const pubkey = await signer.getPublicKey()
        // Verify pubkey matches stored pubkey
        if (pubkey !== accountData.pubkey) {
          console.warn('Extension pubkey does not match stored pubkey')
          return null
        }
        return new ExtensionAccount(pubkey, signer)
      }

      case 'nsec': {
        // Note: nsec is not stored for security reasons
        // User must re-enter nsec on reload
        console.warn('Nsec accounts require re-authentication for security')
        return null
      }

      case 'bunker': {
        if (!accountData.data) {
          console.warn('Bunker URI missing for account')
          return null
        }
        try {
          const options: any = {}
          if (accountData.clientKey) {
            options.signer = PrivateKeySigner.fromKey(accountData.clientKey)
          }

          const signer = await NostrConnectSigner.fromBunkerURI(accountData.data, options)
          const pubkey = await signer.getPublicKey()
          // Verify pubkey matches stored pubkey
          if (pubkey !== accountData.pubkey) {
            console.warn('Bunker pubkey does not match stored pubkey')
            return null
          }
          return new NostrConnectAccount(pubkey, signer)
        } catch (error) {
          console.error('Failed to restore bunker account:', error)
          return null
        }
      }

      default:
        console.warn('Unknown account method:', accountData.method)
        return null
    }
  } catch (error) {
    console.error('Failed to restore account:', error)
    return null
  }
}

/**
 * Restore all accounts to AccountManager
 */
export async function restoreAccountsToManager(accountManager: AccountManager): Promise<void> {
  const persistedAccounts = loadAccountsFromStorage()
  const activePubkey = loadActiveAccount()

  if (persistedAccounts.length === 0) {
    return
  }

  // Check if we have extension accounts - if so, wait for extension to be ready
  const hasExtensionAccounts = persistedAccounts.some(acc => acc.method === 'extension')
  if (hasExtensionAccounts) {
    const extensionReady = await waitForExtension(3000)
    if (!extensionReady) {
      console.warn(
        '[AccountPersistence] Extension not available after waiting, extension accounts will not be restored'
      )
    }
  }

  const restoredAccounts: IAccount[] = []

  for (const accountData of persistedAccounts) {
    // Skip extension wait in restoreAccount since we already waited above
    const account = await restoreAccount(accountData, true)
    if (account) {
      restoredAccounts.push(account)
      accountManager.addAccount(account)
    } else if (accountData.method !== 'nsec') {
      // Remove account that cannot be restored (except nsec which requires re-auth)
      removeAccountFromStorage(accountData.pubkey)
    }
  }

  // Set active account if it was restored
  if (activePubkey) {
    const activeAccount = restoredAccounts.find(acc => acc.pubkey === activePubkey)
    if (activeAccount) {
      accountManager.setActive(activeAccount)
    } else {
      // Active account not found, clear it
      saveActiveAccount(null)
    }
  }
}

/**
 * Clear all persisted account data
 */
export function clearAllAccounts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_ACCOUNTS)
    localStorage.removeItem(STORAGE_KEY_ACTIVE)
  } catch (error) {
    console.error('Failed to clear accounts:', error)
  }
}

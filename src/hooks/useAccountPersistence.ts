import type { IAccount } from 'applesauce-accounts'
import { AccountManager } from 'applesauce-accounts'
import { ExtensionAccount, NostrConnectAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner, NostrConnectSigner } from 'applesauce-signers'

const STORAGE_KEY_ACCOUNTS = 'nostr:accounts'
const STORAGE_KEY_ACTIVE = 'nostr:active-account'

export type AccountMethod = 'extension' | 'nsec' | 'bunker'

export interface PersistedAccount {
  pubkey: string
  method: AccountMethod
  data?: string // nsec (for nsec accounts) or bunker URI (for bunker accounts)
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
 * Restore a single account from persisted data
 */
export async function restoreAccount(accountData: PersistedAccount): Promise<IAccount | null> {
  try {
    switch (accountData.method) {
      case 'extension': {
        if (!canRestoreExtensionAccount()) {
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
          const signer = await NostrConnectSigner.fromBunkerURI(accountData.data)
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

  const restoredAccounts: IAccount[] = []

  for (const accountData of persistedAccounts) {
    const account = await restoreAccount(accountData)
    if (account) {
      restoredAccounts.push(account)
      accountManager.addAccount(account)
    } else {
      // Remove account that cannot be restored
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

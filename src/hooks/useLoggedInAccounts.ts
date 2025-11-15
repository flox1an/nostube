import { useAccountManager } from 'applesauce-react/hooks'
import { type IAccount } from 'applesauce-accounts'

export interface Account {
  id: string
  pubkey: string
  event?: unknown
  metadata: Record<string, unknown>
}

export function useLoggedInAccounts() {
  const accountManager = useAccountManager()

  // Get all accounts from AccountManager
  const accounts = accountManager?.accounts || []

  // Current user is the first account (assuming first is active)
  const currentUser: IAccount | undefined = accounts[0]

  // Account management functions
  const setLogin = (_account: Record<string, unknown>) => {
    // This would need to be implemented based on how applesauce handles account switching
    // For now, we'll leave it as a placeholder
    console.warn('setLogin not implemented for applesauce migration')
  }

  const removeLogin = (_accountId: string) => {
    // This would need to be implemented based on how applesauce handles account removal
    // For now, we'll leave it as a placeholder
    console.warn('removeLogin not implemented for applesauce migration')
  }

  return {
    currentUser,
    setLogin,
    removeLogin,
  }
}

import { useActiveAccount, useAccountManager } from 'applesauce-react/hooks'
import { ExtensionAccount, SimpleAccount, NostrConnectAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner, SimpleSigner, NostrConnectSigner } from 'applesauce-signers/signers'
import { useProfile } from './useProfile'

export function useCurrentUser() {
  const accountManager = useAccountManager(false)
  const activeAccount = useActiveAccount()

  // Create a user object compatible with the existing interface
  const user = activeAccount
    ? {
        pubkey: activeAccount.pubkey,
        signer: activeAccount.signer,
      }
    : undefined

  // Get all accounts as users array
  const users =
    accountManager?.accounts.map(account => ({
      pubkey: account.pubkey,
      signer: account.signer,
    })) || []

  // Login functions using account manager
  const loginWithExtension = async () => {
    if (!accountManager) throw new Error('Account manager not available')

    const signer = new ExtensionSigner()
    const pubkey = await signer.getPublicKey()
    const account = new ExtensionAccount(pubkey, signer)

    await accountManager.addAccount(account)
  }

  const loginWithNsec = async (nsec: string) => {
    if (!accountManager) throw new Error('Account manager not available')

    const signer = SimpleSigner.fromKey(nsec)
    const pubkey = await signer.getPublicKey()
    const account = new SimpleAccount(pubkey, signer)

    await accountManager.addAccount(account)
  }

  const loginWithBunker = async (bunkerUri: string) => {
    if (!accountManager) throw new Error('Account manager not available')

    const signer = await NostrConnectSigner.fromBunkerURI(bunkerUri)
    const pubkey = await signer.getPublicKey()
    const account = new NostrConnectAccount(pubkey, signer)

    await accountManager.addAccount(account)
  }

  const logout = () => {
    if (activeAccount && accountManager) {
      accountManager.removeAccount(activeAccount.pubkey)
    }
  }

  const author = useProfile({ pubkey: user?.pubkey || '' })

  return {
    user,
    users,
    loginWithExtension,
    loginWithNsec,
    loginWithBunker,
    logout,
    ...author,
  }
}

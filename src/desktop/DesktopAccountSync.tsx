import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ExtensionAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner } from 'applesauce-signers'
import { AccountsContext } from 'applesauce-react'
import { useContext, useEffect, type ContextType } from 'react'
import { installDesktopNostrBridge } from './nostr-bridge'

type PublicAccountState = {
  activePubkey: string | null
  locked: boolean
}

type DesktopAccount = {
  pubkey: string
}

const reconcileDesktopAccount = async (
  manager: NonNullable<ContextType<typeof AccountsContext>>,
  state: PublicAccountState
) => {
  if (state.locked || !state.activePubkey) {
    manager.clearActive()
    return
  }

  let account = manager.accounts.find(candidate => candidate.pubkey === state.activePubkey)
  if (!account) {
    account = new ExtensionAccount(state.activePubkey, new ExtensionSigner())
    manager.addAccount(account)
  }
  manager.setActive(account)
}

const restoreDesktopAccounts = async (
  manager: NonNullable<ContextType<typeof AccountsContext>>
) => {
  const accounts = await invoke<DesktopAccount[]>('desktop_accounts')
  for (const account of accounts) {
    if (!manager.accounts.some(candidate => candidate.pubkey === account.pubkey)) {
      manager.addAccount(new ExtensionAccount(account.pubkey, new ExtensionSigner()))
    }
  }
}

export function DesktopAccountSync() {
  const manager = useContext(AccountsContext)

  useEffect(() => {
    if (!manager || !isTauri()) return
    installDesktopNostrBridge()

    let disposed = false
    let unlisten: (() => void) | undefined
    const synchronize = (state: PublicAccountState) => {
      if (!disposed) {
        void reconcileDesktopAccount(manager, state)
      }
    }

    void restoreDesktopAccounts(manager)
      .then(() => invoke<PublicAccountState>('desktop_restore_account'))
      .then(synchronize)
    void listen<PublicAccountState>('desktop-account-state', event =>
      synchronize(event.payload)
    ).then(stop => {
      if (disposed) stop()
      else unlisten = stop
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [manager])

  return null
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { IAccount } from 'applesauce-accounts'
import { useActiveAccount } from 'applesauce-react/hooks'
import { AccountsProvider } from 'applesauce-react/providers'
import LoginDialog from '@nostube/widgets/components/auth/LoginDialog'
import { accountManager, loadAccounts, type LoginConnection } from './accounts'
import { createManagedKey, loadSigner, type SignerInfo } from './api'
import i18n from './i18n'
import { managedSigner, type Signer } from './signer'

export interface SignerState {
  /** `loading` while the page asks the server and restores the accounts, `none` without a signer. */
  status: 'loading' | 'none' | 'ready'
  /** Where the key lives, as the server reports it; `null` while loading or when that failed. */
  mode: SignerInfo['mode'] | null
  signer: Signer | null
  /**
   * The key everything is signed with: the managed key, else the creator key from the config (own
   * identity), else the Nostr account logged in here (onboarding). Signing checks that the signer
   * really uses it.
   */
  pubkey: string | null
  /** Why the server's signer state or the stored accounts could not be read. */
  error: string | null
  /**
   * The Nostr account logged in in this browser; without one, opens the login dialog (extension,
   * nsec, bunker, Nostr Connect). `null` when the dialog is closed without logging in.
   */
  connect: () => Promise<IAccount | null>
  /** Onboarding: has the server create the managed key and signs with it from now on. */
  createManaged: () => Promise<string>
}

const SignerContext = createContext<SignerState | null>(null)

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * The signer for everything in the studio that has to be signed: the server's managed key when
 * the server holds one, else the Nostr account logged in in this browser.
 */
export function SignerProvider(props: {
  /** The creator key of own identity (from the config), `null` before onboarding. */
  creatorKey: string | null
  children: ReactNode
}) {
  return (
    <AccountsProvider manager={accountManager}>
      <SignerStateProvider {...props} />
    </AccountsProvider>
  )
}

function SignerStateProvider({
  creatorKey,
  children,
}: {
  creatorKey: string | null
  children: ReactNode
}) {
  const account = useActiveAccount() ?? null
  const [server, setServer] = useState<SignerInfo | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  /** The identity label and relays of a new pairing, set after stored accounts are restored. */
  const [connection, setConnection] = useState<LoginConnection | null>(null)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const settle = useRef<(account: IAccount | null) => void>(undefined)

  useEffect(() => {
    let live = true
    loadSigner().then(
      info => live && setServer(info),
      e => live && setServerError(message(e))
    )
    loadAccounts().then(
      next => live && setConnection(next),
      e => live && setAccountsError(message(e))
    )
    return () => {
      live = false
    }
  }, [])

  const connect = useCallback(
    () =>
      account
        ? Promise.resolve(account)
        : new Promise<IAccount | null>(resolve => {
            settle.current = resolve
            setConnecting(true)
          }),
    [account]
  )

  const close = (next: IAccount | null) => {
    settle.current?.(next)
    settle.current = undefined
    setConnecting(false)
  }

  const createManaged = useCallback(async () => {
    const info = await createManagedKey()
    if (!info.pubkey) throw new Error(i18n.t('studio.errors.notPubkey'))
    setServer(info)
    return info.pubkey
  }, [])

  const managedKey = server?.mode === 'managed' ? server.pubkey : null
  const value = useMemo<SignerState>(() => {
    if (managedKey) {
      // The accounts do not matter for signing here (only for binding a login key).
      return {
        status: 'ready',
        mode: 'managed',
        signer: managedSigner(managedKey),
        pubkey: managedKey,
        error: serverError,
        connect,
        createManaged,
      }
    }
    const error = serverError ?? accountsError
    // Without the server's answer the key might be the managed one: sign with nothing.
    const signer = serverError ? null : account
    const loading = !error && (server === null || connection === null)
    return {
      status: loading ? 'loading' : signer ? 'ready' : 'none',
      mode: server?.mode ?? null,
      signer,
      pubkey: creatorKey ?? signer?.pubkey ?? null,
      error,
      connect,
      createManaged,
    }
  }, [
    managedKey,
    server,
    serverError,
    accountsError,
    connection,
    account,
    creatorKey,
    connect,
    createManaged,
  ])

  return (
    <SignerContext.Provider value={value}>
      {children}
      {connecting && connection && (
        <LoginDialog
          isOpen
          {...connection}
          // The dialog calls `onLogin` and then `onClose`: the account settles first.
          onLogin={() => close(accountManager.active ?? null)}
          onClose={() => close(null)}
        />
      )}
    </SignerContext.Provider>
  )
}

export function useSigner(): SignerState {
  const value = useContext(SignerContext)
  if (!value) throw new Error('useSigner needs a SignerProvider')
  return value
}

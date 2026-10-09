import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createManagedKey, loadSigner, type SignerInfo } from './api'
import i18n from './i18n'
import { findSigner, managedSigner, type Signer } from './signer'

interface Found {
  /** `loading` while the page asks the server and looks for an extension, `none` without a signer. */
  status: 'loading' | 'none' | 'ready'
  /** Where the key lives, as the server reports it; `null` while loading or when that failed. */
  mode: SignerInfo['mode'] | null
  signer: Signer | null
  /** The key of the signer: the managed key at once, an extension's once the owner connected it. */
  pubkey: string | null
  /** Why the server's signer state could not be read. */
  error: string | null
}

export interface SignerState extends Found {
  /** Asks the signer for its key (an extension shows its permission prompt). */
  connect: () => Promise<string>
  /** Onboarding: has the server create the managed key and signs with it from now on. */
  createManaged: () => Promise<string>
}

const SignerContext = createContext<SignerState | null>(null)

const managed = (pubkey: string): Found => ({
  status: 'ready',
  mode: 'managed',
  signer: managedSigner(pubkey),
  pubkey,
  error: null,
})

/**
 * The signer for everything in the studio that has to be signed: the server's managed key when
 * the server holds one, else the browser's NIP-07 extension.
 */
export function SignerProvider({ children }: { children: ReactNode }) {
  const [found, setFound] = useState<Found>({
    status: 'loading',
    mode: null,
    signer: null,
    pubkey: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<Found> => {
      const info = await loadSigner()
      if (info.mode === 'managed' && info.pubkey) return managed(info.pubkey)
      const signer = await findSigner()
      return {
        status: signer ? 'ready' : 'none',
        mode: info.mode,
        signer,
        pubkey: null,
        error: null,
      }
    }
    load().then(
      next => !cancelled && setFound(next),
      (e: unknown) =>
        !cancelled &&
        setFound({
          status: 'none',
          mode: null,
          signer: null,
          pubkey: null,
          error: e instanceof Error ? e.message : String(e),
        })
    )
    return () => {
      cancelled = true
    }
  }, [])

  const { signer } = found
  const connect = useCallback(async () => {
    if (!signer) throw new Error(i18n.t('studio.errors.noSigner'))
    const key = await signer.getPublicKey()
    setFound(f => ({ ...f, pubkey: key }))
    return key
  }, [signer])

  const createManaged = useCallback(async () => {
    const info = await createManagedKey()
    if (!info.pubkey) throw new Error(i18n.t('studio.errors.notPubkey'))
    setFound(managed(info.pubkey))
    return info.pubkey
  }, [])

  const value = useMemo(
    () => ({ ...found, connect, createManaged }),
    [found, connect, createManaged]
  )
  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>
}

export function useSigner(): SignerState {
  const value = useContext(SignerContext)
  if (!value) throw new Error('useSigner needs a SignerProvider')
  return value
}

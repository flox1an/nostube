import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import i18n from './i18n'
import { findSigner, type Signer } from './signer'

export interface SignerState {
  /** `loading` while the page looks for an extension, `none` when there is no signer. */
  status: 'loading' | 'none' | 'ready'
  signer: Signer | null
  /** The key of the connected signer, once the owner connected it. */
  pubkey: string | null
  /** Asks the signer for its key (the extension shows its permission prompt). */
  connect: () => Promise<string>
}

const SignerContext = createContext<SignerState | null>(null)

/** The browser's signer for everything in the studio that has to be signed. */
export function SignerProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<Signer | null>(null)
  const [status, setStatus] = useState<SignerState['status']>('loading')
  const [pubkey, setPubkey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    findSigner().then(found => {
      if (cancelled) return
      setSigner(found)
      setStatus(found ? 'ready' : 'none')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(async () => {
    if (!signer) throw new Error(i18n.t('studio.errors.noSigner'))
    const key = await signer.getPublicKey()
    setPubkey(key)
    return key
  }, [signer])

  const value = useMemo(
    () => ({ status, signer, pubkey, connect }),
    [status, signer, pubkey, connect]
  )
  return <SignerContext.Provider value={value}>{children}</SignerContext.Provider>
}

export function useSigner(): SignerState {
  const value = useContext(SignerContext)
  if (!value) throw new Error('useSigner needs a SignerProvider')
  return value
}

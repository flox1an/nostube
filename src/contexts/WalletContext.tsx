import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { WalletConnect } from 'applesauce-wallet-connect'
import { ActionRunner } from 'applesauce-actions'
import { CashuMint, CashuWallet, type MeltQuoteResponse } from '@cashu/cashu-ts'
import * as WalletHelpers from 'applesauce-wallet/helpers'
import * as WalletModels from 'applesauce-wallet/models'
import * as WalletActions from 'applesauce-wallet/actions'
import { use$ } from 'applesauce-react/hooks'
import { FactoryContext } from 'applesauce-react/providers'
import { map } from 'rxjs'
import {
  relayPool,
  eventStore,
  subscriptionMethod,
  publishMethod,
  DEFAULT_RELAYS,
} from '@/nostr/core'
import { useCurrentUser } from '@/hooks'
import type { NostrEvent } from 'nostr-tools'

// Storage keys
const NWC_STORAGE_KEY = 'nwc-connection'
const WALLET_TYPE_KEY = 'wallet-type'
const CASHU_MINT_URL_KEY = 'cashu-mint-url'

// Wallet types
export type WalletType = 'nwc' | 'cashu' | null

// Common wallet info interface
export interface WalletInfo {
  type: WalletType
  alias?: string
  pubkey?: string
  methods?: string[]
  mints?: string[]
}

// Cashu mint info
export interface CashuMintInfo {
  url: string
  balance: number
}

interface WalletContextValue {
  // Connection state
  walletType: WalletType
  isConnected: boolean
  isConnecting: boolean
  error: string | null

  // Wallet info
  walletInfo: WalletInfo | null
  balance: number | null

  // Cashu-specific
  cashuMints: CashuMintInfo[]
  cashuWalletEvent: NostrEvent | undefined
  isUnlocking: boolean

  // NWC connection
  connectNWC: (connectionString: string) => Promise<void>

  // Cashu wallet operations
  createCashuWallet: (mints: string[]) => Promise<void>
  unlockCashuWallet: () => Promise<void>
  addCashuMint: (mintUrl: string) => Promise<void>

  // Common operations
  disconnect: () => void
  refreshBalance: () => Promise<void>
  payInvoice: (bolt11: string) => Promise<{ preimage: string }>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const factory = useContext(FactoryContext)
  const currentUser = useCurrentUser()
  const userPubkey = currentUser.user?.pubkey

  // State
  const [walletType, setWalletType] = useState<WalletType>(() => {
    const stored = localStorage.getItem(WALLET_TYPE_KEY)
    return (stored as WalletType) || null
  })
  const [nwcClient, setNwcClient] = useState<WalletConnect | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cashuMints, setCashuMints] = useState<CashuMintInfo[]>([])

  // Action runner for Cashu wallet operations
  const actionRunner = useMemo(() => {
    if (!factory) return null
    return new ActionRunner(eventStore, factory, (event, relays) =>
      relayPool.publish(relays ?? DEFAULT_RELAYS, event)
    )
  }, [factory])

  // Subscribe to Cashu wallet event (kind 17375)
  const cashuWalletEvent = use$(
    () =>
      userPubkey
        ? eventStore
            .replaceable(WalletHelpers.WALLET_KIND, userPubkey)
            .pipe(map(event => event ?? undefined))
        : undefined,
    [userPubkey]
  )

  // Subscribe to Cashu balance model
  const cashuBalances = use$(
    () =>
      userPubkey && walletType === 'cashu'
        ? eventStore.model(WalletModels.WalletBalanceModel, userPubkey)
        : undefined,
    [userPubkey, walletType]
  ) as Record<string, number> | undefined

  // Calculate total Cashu balance across all mints
  useEffect(() => {
    if (walletType === 'cashu' && cashuBalances) {
      const mintInfos: CashuMintInfo[] = Object.entries(cashuBalances).map(([url, bal]) => ({
        url,
        balance: bal,
      }))
      setCashuMints(mintInfos)
      const total = Object.values(cashuBalances).reduce((sum, b) => sum + b, 0)
      setBalance(total)
    }
  }, [cashuBalances, walletType])

  // NWC connection
  const connectNWC = useCallback(async (connectionString: string) => {
    setIsConnecting(true)
    setError(null)

    try {
      if (!connectionString.startsWith('nostr+walletconnect://')) {
        throw new Error('Invalid NWC URI format')
      }

      // Set up static methods for applesauce-wallet-connect
      WalletConnect.pool = relayPool
      WalletConnect.subscriptionMethod = subscriptionMethod
      WalletConnect.publishMethod = publishMethod

      const client = WalletConnect.fromConnectURI(connectionString)

      // Get wallet info
      const info = await client.getInfo()
      setWalletInfo({
        type: 'nwc',
        alias: info.alias,
        pubkey: info.pubkey,
        methods: info.methods,
      })

      // Get balance
      const balanceResult = await client.getBalance()
      setBalance(balanceResult.balance)

      setNwcClient(client)
      setWalletType('nwc')
      localStorage.setItem(NWC_STORAGE_KEY, connectionString)
      localStorage.setItem(WALLET_TYPE_KEY, 'nwc')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Create new Cashu wallet (NIP-60)
  const createCashuWallet = useCallback(
    async (mints: string[]) => {
      if (!actionRunner || !userPubkey) {
        throw new Error('Not logged in')
      }

      setIsConnecting(true)
      setError(null)

      try {
        // Create wallet using applesauce-wallet action
        await actionRunner.run(WalletActions.CreateWallet, {
          mints,
          relays: DEFAULT_RELAYS,
        })

        setWalletType('cashu')
        setWalletInfo({
          type: 'cashu',
          mints,
        })
        localStorage.setItem(WALLET_TYPE_KEY, 'cashu')
        if (mints.length > 0) {
          localStorage.setItem(CASHU_MINT_URL_KEY, mints[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create Cashu wallet')
        throw err
      } finally {
        setIsConnecting(false)
      }
    },
    [actionRunner, userPubkey]
  )

  // Unlock existing Cashu wallet
  const unlockCashuWallet = useCallback(async () => {
    if (!actionRunner || !cashuWalletEvent) {
      throw new Error('No wallet to unlock')
    }

    setIsUnlocking(true)
    setError(null)

    try {
      // Unlock the wallet and tokens
      await actionRunner.run(WalletActions.UnlockWallet, {
        history: true,
        tokens: true,
      })

      // Get mints from unlocked wallet
      const mints = WalletHelpers.getWalletMints(cashuWalletEvent)

      setWalletType('cashu')
      setWalletInfo({
        type: 'cashu',
        mints,
      })
      localStorage.setItem(WALLET_TYPE_KEY, 'cashu')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet')
      throw err
    } finally {
      setIsUnlocking(false)
    }
  }, [actionRunner, cashuWalletEvent])

  // Add a mint to the Cashu wallet
  const addCashuMint = useCallback(
    async (mintUrl: string) => {
      if (!actionRunner || !cashuWalletEvent) {
        throw new Error('No wallet available')
      }

      setError(null)

      try {
        const currentMints = WalletHelpers.getWalletMints(cashuWalletEvent) || []
        if (currentMints.includes(mintUrl)) {
          throw new Error('Mint already added')
        }

        await actionRunner.run(WalletActions.SetWalletMints, [...currentMints, mintUrl])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add mint')
        throw err
      }
    },
    [actionRunner, cashuWalletEvent]
  )

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setNwcClient(null)
    setBalance(null)
    setWalletInfo(null)
    setWalletType(null)
    setError(null)
    setCashuMints([])
    localStorage.removeItem(NWC_STORAGE_KEY)
    localStorage.removeItem(WALLET_TYPE_KEY)
    localStorage.removeItem(CASHU_MINT_URL_KEY)
  }, [])

  // Refresh balance
  const refreshBalance = useCallback(async () => {
    if (walletType === 'nwc' && nwcClient) {
      try {
        const result = await nwcClient.getBalance()
        setBalance(result.balance)
      } catch (err) {
        console.error('Failed to refresh NWC balance:', err)
      }
    }
    // Cashu balance updates automatically via subscription
  }, [walletType, nwcClient])

  // Pay invoice
  const payInvoice = useCallback(
    async (bolt11: string): Promise<{ preimage: string }> => {
      if (walletType === 'nwc' && nwcClient) {
        const result = await nwcClient.payInvoice(bolt11)
        refreshBalance()
        return result
      }

      if (walletType === 'cashu') {
        if (!cashuWalletEvent || !WalletHelpers.isWalletUnlocked(cashuWalletEvent)) {
          throw new Error('Cashu wallet not unlocked')
        }

        // Get mint from wallet
        const mints = WalletHelpers.getWalletMints(cashuWalletEvent)
        if (!mints || mints.length === 0) {
          throw new Error('No mints configured')
        }

        if (!userPubkey) {
          throw new Error('Not logged in')
        }

        // Use the first mint with sufficient balance
        const mintUrl = mints[0]
        const mint = new CashuMint(mintUrl)
        const cashuWallet = new CashuWallet(mint)

        // Get melt quote to know the amount needed
        const meltQuote: MeltQuoteResponse = await cashuWallet.createMeltQuote(bolt11)
        const amountNeeded = meltQuote.amount + meltQuote.fee_reserve

        // Get token events from store
        const tokenEvents = eventStore.getByFilters([
          { kinds: [WalletHelpers.WALLET_TOKEN_KIND], authors: [userPubkey] },
        ])

        // Select tokens using dumb selection
        const { proofs } = WalletHelpers.dumbTokenSelection(tokenEvents, amountNeeded, mintUrl)

        // Melt the tokens to pay the invoice
        const meltResult = await cashuWallet.meltProofs(meltQuote, proofs)

        // Store change if any
        if (meltResult.change && meltResult.change.length > 0 && actionRunner) {
          const token = { mint: mintUrl, proofs: meltResult.change }
          await actionRunner.run(WalletActions.AddToken, token)
        }

        // Return preimage from the melt quote response
        return { preimage: meltResult.quote?.state === 'PAID' ? 'paid' : '' }
      }

      throw new Error('No wallet connected')
    },
    [walletType, nwcClient, cashuWalletEvent, userPubkey, actionRunner, refreshBalance]
  )

  // Restore NWC connection on mount
  useEffect(() => {
    const storedType = localStorage.getItem(WALLET_TYPE_KEY) as WalletType
    const storedNwc = localStorage.getItem(NWC_STORAGE_KEY)

    if (storedType === 'nwc' && storedNwc) {
      connectNWC(storedNwc).catch(err => {
        console.error('Failed to restore NWC connection:', err)
        // Clear invalid stored connection
        localStorage.removeItem(NWC_STORAGE_KEY)
        localStorage.removeItem(WALLET_TYPE_KEY)
      })
    }
  }, [connectNWC])

  // Auto-detect Cashu wallet when user logs in
  useEffect(() => {
    const storedType = localStorage.getItem(WALLET_TYPE_KEY)
    if (storedType === 'cashu' && cashuWalletEvent && userPubkey) {
      setWalletType('cashu')
      const mints = WalletHelpers.isWalletUnlocked(cashuWalletEvent)
        ? WalletHelpers.getWalletMints(cashuWalletEvent)
        : []
      setWalletInfo({
        type: 'cashu',
        mints,
      })
    }
  }, [cashuWalletEvent, userPubkey])

  const isConnected = walletType === 'nwc' ? nwcClient !== null : walletType === 'cashu'

  return (
    <WalletContext.Provider
      value={{
        walletType,
        isConnected,
        isConnecting,
        isUnlocking,
        error,
        walletInfo,
        balance,
        cashuMints,
        cashuWalletEvent,
        connectNWC,
        createCashuWallet,
        unlockCashuWallet,
        addCashuMint,
        disconnect,
        refreshBalance,
        payInvoice,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWalletContext() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletContext must be used within WalletProvider')
  }
  return context
}

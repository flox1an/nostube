import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { WalletConnect } from 'applesauce-wallet-connect'
import { relayPool, subscriptionMethod, publishMethod } from '@/nostr/core'

const NWC_STORAGE_KEY = 'nwc-connection'

interface WalletInfo {
  alias?: string
  pubkey?: string
  methods: string[]
}

interface WalletContextValue {
  isConnected: boolean
  isConnecting: boolean
  balance: number | null
  walletInfo: WalletInfo | null
  error: string | null
  connect: (connectionString: string) => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
  payInvoice: (bolt11: string) => Promise<{ preimage: string }>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnect | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const connectInternal = useCallback(async (connectionString: string) => {
    setIsConnecting(true)
    setError(null)

    try {
      // Validate URI format
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
        alias: info.alias,
        pubkey: info.pubkey,
        methods: info.methods,
      })

      // Get balance
      const balanceResult = await client.getBalance()
      setBalance(balanceResult.balance)

      setWallet(client)
      localStorage.setItem(NWC_STORAGE_KEY, connectionString)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Restore connection on mount
  useEffect(() => {
    const stored = localStorage.getItem(NWC_STORAGE_KEY)
    if (stored) {
      connectInternal(stored).catch(console.error)
    }
  }, [connectInternal])

  const connect = useCallback(
    async (connectionString: string) => {
      await connectInternal(connectionString)
    },
    [connectInternal]
  )

  const disconnect = useCallback(() => {
    setWallet(null)
    setBalance(null)
    setWalletInfo(null)
    setError(null)
    localStorage.removeItem(NWC_STORAGE_KEY)
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!wallet) return
    try {
      const result = await wallet.getBalance()
      setBalance(result.balance)
    } catch (err) {
      console.error('Failed to refresh balance:', err)
    }
  }, [wallet])

  const payInvoice = useCallback(
    async (bolt11: string) => {
      if (!wallet) throw new Error('Wallet not connected')
      const result = await wallet.payInvoice(bolt11)
      // Refresh balance after payment
      refreshBalance()
      return result
    },
    [wallet, refreshBalance]
  )

  return (
    <WalletContext.Provider
      value={{
        isConnected: wallet !== null,
        isConnecting,
        balance,
        walletInfo,
        error,
        connect,
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

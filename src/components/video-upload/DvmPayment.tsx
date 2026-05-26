/**
 * DVM Payment component
 *
 * Shown when a DVM requires payment before starting a transcode job.
 * Supports Cashu tokens (direct from wallet) and NWC (mint fresh tokens via Lightning).
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Zap, Wallet, AlertCircle, ExternalLink } from 'lucide-react'
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts'
import * as WalletHelpers from 'applesauce-wallet/helpers'
import { useWalletContext } from '@/contexts/WalletContext'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { relayPool, eventStore } from '@/nostr/core'
import { nowInSecs } from '@/lib/utils'
import { type DvmBid } from '@/lib/dvm-utils'
import type { EventTemplate } from 'nostr-tools'

interface DvmPaymentProps {
  bid: DvmBid
  requestEventId: string
  writeRelays: string[]
  onPaid: () => void
  onCancel: () => void
}

/** Amount in millisats → sats (ceiling) */
function msatsToSats(msats: string): number {
  const n = parseInt(msats, 10)
  if (isNaN(n) || n <= 0) return 0
  return Math.ceil(n / 1000)
}

/**
 * Card shown when a DVM sends a payment-required bid.
 * Tries to pay automatically with the connected wallet.
 */
export function DvmPayment({
  bid,
  requestEventId,
  writeRelays,
  onPaid,
  onCancel,
}: DvmPaymentProps) {
  const { user } = useCurrentUser()
  const wallet = useWalletContext()
  const [isPaying, setIsPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountSats = msatsToSats(bid.amount)
  // bid.cashu holds the mint URL the DVM accepts payment at
  const mintUrl = bid.cashu

  const cashuBalanceAtMint =
    mintUrl !== undefined ? (wallet.cashuMints.find(m => m.url === mintUrl)?.balance ?? 0) : 0

  const canPayCashu =
    wallet.walletType === 'cashu' &&
    wallet.isCashuWalletUnlocked &&
    mintUrl !== undefined &&
    cashuBalanceAtMint >= amountSats

  const canPayNwc = wallet.walletType === 'nwc' && wallet.isConnected && mintUrl !== undefined

  const canPay = canPayCashu || canPayNwc

  const handlePay = async () => {
    if (!user || !mintUrl) return
    setIsPaying(true)
    setError(null)

    try {
      let encodedToken: string

      if (canPayCashu && wallet.cashuWalletEvent) {
        // Select proofs from the user's existing Cashu wallet tokens at this mint
        const tokenEvents = eventStore.getByFilters([
          { kinds: [WalletHelpers.WALLET_TOKEN_KIND], authors: [user.pubkey] },
        ])
        const { proofs } = WalletHelpers.dumbTokenSelection(tokenEvents, amountSats, mintUrl)
        if (proofs.length === 0) {
          throw new Error(`Insufficient tokens at mint ${mintUrl}`)
        }
        // Encode the selected proofs as a Cashu token string
        encodedToken = getEncodedToken({ mint: mintUrl, proofs })
        // Note: The mint will mark these proofs as spent when the DVM claims them.
        // The wallet will sync and remove them on next balance refresh.
      } else if (canPayNwc) {
        // Mint fresh Cashu tokens by getting a Lightning invoice from the mint and paying via NWC
        const mint = new CashuMint(mintUrl)
        const cashuWallet = new CashuWallet(mint)

        // Get a mint quote (returns a Lightning invoice)
        const mintQuote = await cashuWallet.createMintQuote(amountSats)

        // Pay the Lightning invoice via NWC
        await wallet.payInvoice(mintQuote.request)

        // Collect the fresh Cashu proofs from the mint
        const proofs = await cashuWallet.mintProofs(amountSats, mintQuote.quote)
        encodedToken = getEncodedToken({ mint: mintUrl, proofs })
      } else {
        throw new Error('No compatible wallet available for payment')
      }

      // Publish a kind 7000 payment event to the DVM with the Cashu token
      const paymentEvent: EventTemplate = {
        kind: 7000,
        content: '',
        created_at: nowInSecs(),
        tags: [
          ['e', requestEventId],
          ['p', bid.pubkey],
          ['status', 'payment-sent'],
          ['cashu', encodedToken],
        ],
      }
      const signed = await user.signer.signEvent(paymentEvent)
      await relayPool.publish(writeRelays, signed)

      onPaid()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setIsPaying(false)
    }
  }

  const mintHostname = (() => {
    try {
      return mintUrl ? new URL(mintUrl).hostname : undefined
    } catch {
      return mintUrl
    }
  })()

  return (
    <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Zap className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Payment Required
          </div>
          <div className="text-sm text-amber-700 dark:text-amber-300">
            This transcoding service charges <strong>{amountSats} sats</strong> for this job.
          </div>
          {mintHostname && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Mint: {mintHostname}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!wallet.isConnected && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Connect a wallet in Settings to pay automatically.
        </div>
      )}

      {wallet.walletType === 'cashu' && !wallet.isCashuWalletUnlocked && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Unlock your Cashu wallet in Settings to pay.
        </div>
      )}

      {wallet.walletType === 'cashu' &&
        wallet.isCashuWalletUnlocked &&
        mintUrl !== undefined &&
        !canPayCashu && (
          <div className="text-xs text-amber-600 dark:text-amber-400">
            Balance at {mintHostname ?? 'this mint'} ({cashuBalanceAtMint} sats) is insufficient.
            {canPayNwc
              ? ' Using NWC to mint fresh tokens.'
              : ' Add funds or connect an NWC wallet.'}
          </div>
        )}

      <div className="flex gap-2">
        {canPay ? (
          <Button
            size="sm"
            onClick={handlePay}
            disabled={isPaying}
            className="cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPaying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4 mr-2" />
            )}
            {isPaying ? 'Paying...' : `Pay ${amountSats} sats`}
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild className="cursor-pointer">
            <a href="/settings/wallet" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Wallet Settings
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onCancel} className="cursor-pointer">
          Cancel
        </Button>
      </div>
    </div>
  )
}

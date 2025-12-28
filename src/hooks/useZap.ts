import { useState, useCallback } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useCurrentUser, useWallet, useAppContext } from '@/hooks'
import { getRecipientZapEndpoint, createZapRequest, requestInvoice } from '@/lib/zap-utils'
import { toast } from 'sonner'

const DEFAULT_ZAP_AMOUNT = 21

interface UseZapOptions {
  eventId: string
  eventKind: number
  authorPubkey: string
}

interface UseZapReturn {
  zap: (amount?: number, comment?: string) => Promise<boolean>
  isZapping: boolean
  needsWallet: boolean
  setNeedsWallet: (value: boolean) => void
}

export function useZap({ eventId, eventKind, authorPubkey }: UseZapOptions): UseZapReturn {
  const [isZapping, setIsZapping] = useState(false)
  const [needsWallet, setNeedsWallet] = useState(false)
  const { user } = useCurrentUser()
  const { isConnected, payInvoice } = useWallet()
  const { config } = useAppContext()
  const eventStore = useEventStore()

  const zap = useCallback(
    async (amount: number = DEFAULT_ZAP_AMOUNT, comment?: string): Promise<boolean> => {
      if (!user) {
        toast.error('Please log in to zap')
        return false
      }

      if (!isConnected) {
        setNeedsWallet(true)
        return false
      }

      const signer = user.signer
      if (!signer) {
        toast.error('No signer available')
        return false
      }

      setIsZapping(true)

      try {
        // Get author's profile event (kind 0 is replaceable)
        const profileEvent = eventStore.getReplaceable(0, authorPubkey)
        if (!profileEvent) {
          toast.error('Could not load author profile')
          return false
        }

        // Get LNURL endpoint
        const zapEndpoint = await getRecipientZapEndpoint(profileEvent)
        if (!zapEndpoint) {
          toast.error('Author cannot receive zaps (no lightning address)')
          return false
        }

        // Get write relays
        const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

        // Create zap request template
        const zapRequestTemplate = createZapRequest({
          recipientPubkey: authorPubkey,
          amount,
          comment,
          relays: writeRelays,
          eventId,
          eventKind,
        })

        // Sign the zap request (kind 9734)
        const signedZapRequest = await signer.signEvent(zapRequestTemplate)

        // Request invoice from LNURL
        const bolt11 = await requestInvoice(zapEndpoint, amount, signedZapRequest)

        // Pay the invoice via NWC
        await payInvoice(bolt11)

        toast.success(`Zapped ${amount} sats!`)
        return true
      } catch (err) {
        console.error('Zap failed:', err)
        toast.error(err instanceof Error ? err.message : 'Zap failed')
        return false
      } finally {
        setIsZapping(false)
      }
    },
    [user, isConnected, eventStore, authorPubkey, config.relays, eventId, eventKind, payInvoice]
  )

  return {
    zap,
    isZapping,
    needsWallet,
    setNeedsWallet,
  }
}

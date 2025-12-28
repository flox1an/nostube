import { useState, useCallback, useMemo } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useCurrentUser, useWallet, useAppContext } from '@/hooks'
import { useUserRelays } from '@/hooks/useUserRelays'
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

  // Get author's inbox relays (NIP-65)
  const authorRelays = useUserRelays(authorPubkey)

  // Get video event from store to access seenRelays
  const videoEvent = useMemo(() => {
    // Try addressable event first (kind 34235/34236)
    if (eventKind === 34235 || eventKind === 34236) {
      return eventStore.getReplaceable(eventKind, authorPubkey)
    }
    // Fall back to regular event
    return eventStore.getEvent(eventId)
  }, [eventStore, eventId, eventKind, authorPubkey])

  // Compute target relays: video seenRelays + author inbox + user write relays
  const targetRelays = useMemo(() => {
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const videoSeenRelays = videoEvent ? Array.from(getSeenRelays(videoEvent) || []) : []
    const authorInboxRelays = authorRelays.data?.filter(r => r.write).map(r => r.url) || []
    return Array.from(new Set([...videoSeenRelays, ...authorInboxRelays, ...writeRelays]))
  }, [config.relays, videoEvent, authorRelays.data])

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

        // Create zap request template with target relays
        // (includes video seenRelays + author inbox + user write relays)
        const zapRequestTemplate = createZapRequest({
          recipientPubkey: authorPubkey,
          amount,
          comment,
          relays: targetRelays,
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
    [user, isConnected, eventStore, authorPubkey, targetRelays, eventId, eventKind, payInvoice]
  )

  return {
    zap,
    isZapping,
    needsWallet,
    setNeedsWallet,
  }
}

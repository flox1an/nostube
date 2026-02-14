import { useState, useCallback, useMemo } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useCurrentUser, useAppContext } from '@/hooks'
import { useWallet } from './useWallet'
import { useUserRelays } from '@/hooks/useUserRelays'
import { getRecipientZapEndpoint, createZapRequest, requestInvoice } from '@/lib/zap-utils'
import { toast } from 'sonner'

interface UseZapOptions {
  eventId?: string // Optional - not provided when zapping a profile directly
  authorPubkey: string
}

interface ZapParams {
  amount?: number
  comment?: string
  timestamp?: number // Video timestamp in seconds (for timestamped zaps)
}

interface UseZapReturn {
  zap: (params?: ZapParams) => Promise<boolean>
  generateInvoice: (amount: number, comment?: string, timestamp?: number) => Promise<string | null>
  isZapping: boolean
  isConnected: boolean
  needsWallet: boolean
  setNeedsWallet: (value: boolean) => void
}

export function useZap({ eventId, authorPubkey }: UseZapOptions): UseZapReturn {
  const [isZapping, setIsZapping] = useState(false)
  const [needsWallet, setNeedsWallet] = useState(false)
  const { user } = useCurrentUser()
  const { isConnected, payInvoice, defaultZapAmount } = useWallet()
  const { config } = useAppContext()
  const eventStore = useEventStore()

  // Get author's inbox relays (NIP-65)
  const authorRelays = useUserRelays(authorPubkey)

  // Get video event from store to access seenRelays (only if eventId is provided)
  const videoEvent = useMemo(() => {
    if (!eventId) return undefined
    return eventStore.getEvent(eventId)
  }, [eventStore, eventId])

  // Compute target relays: video seenRelays + author inbox + user write relays
  // NIP-65: Use both write and read relays for mentions (where author checks)
  const targetRelays = useMemo(() => {
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const videoSeenRelays = videoEvent ? Array.from(getSeenRelays(videoEvent) || []) : []
    const authorInboxRelays =
      authorRelays.data?.filter(r => r.write || r.read).map(r => r.url) || []
    return Array.from(new Set([...videoSeenRelays, ...authorInboxRelays, ...writeRelays]))
  }, [config.relays, videoEvent, authorRelays.data])

  const zap = useCallback(
    async (params?: ZapParams): Promise<boolean> => {
      const { amount = defaultZapAmount, comment, timestamp } = params || {}

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
        // Pass the actual event so d tag is preserved for addressable events
        const zapRequestTemplate = createZapRequest({
          recipientPubkey: authorPubkey,
          amount,
          comment,
          relays: targetRelays,
          event: videoEvent || undefined,
          timestamp,
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
    [
      user,
      isConnected,
      eventStore,
      authorPubkey,
      targetRelays,
      videoEvent,
      payInvoice,
      defaultZapAmount,
    ]
  )

  // Generate invoice without paying (for users without wallet)
  const generateInvoice = useCallback(
    async (amount: number, comment?: string, timestamp?: number): Promise<string | null> => {
      if (!user) {
        toast.error('Please log in to zap')
        return null
      }

      const signer = user.signer
      if (!signer) {
        toast.error('No signer available')
        return null
      }

      try {
        // Get author's profile event (kind 0 is replaceable)
        const profileEvent = eventStore.getReplaceable(0, authorPubkey)
        if (!profileEvent) {
          toast.error('Could not load author profile')
          return null
        }

        // Get LNURL endpoint
        const zapEndpoint = await getRecipientZapEndpoint(profileEvent)
        if (!zapEndpoint) {
          toast.error('Author cannot receive zaps (no lightning address)')
          return null
        }

        // Create zap request template with target relays
        const zapRequestTemplate = createZapRequest({
          recipientPubkey: authorPubkey,
          amount,
          comment,
          relays: targetRelays,
          event: videoEvent || undefined,
          timestamp,
        })

        // Sign the zap request (kind 9734)
        const signedZapRequest = await signer.signEvent(zapRequestTemplate)

        // Request invoice from LNURL
        const bolt11 = await requestInvoice(zapEndpoint, amount, signedZapRequest)

        return bolt11
      } catch (err) {
        console.error('Failed to generate invoice:', err)
        toast.error(err instanceof Error ? err.message : 'Failed to generate invoice')
        return null
      }
    },
    [user, eventStore, authorPubkey, targetRelays, videoEvent]
  )

  return {
    zap,
    generateInvoice,
    isZapping,
    isConnected,
    needsWallet,
    setNeedsWallet,
  }
}

import { useMemo } from 'react'
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks'
import { getInvoiceAmount } from '@/lib/zap-utils'
import type { NostrEvent } from 'nostr-tools'

interface UseVideoZapsReturn {
  totalSats: number
  zapCount: number
  zaps: NostrEvent[]
  isLoading: boolean
}

export function useVideoZaps(eventId: string, authorPubkey: string): UseVideoZapsReturn {
  const eventStore = useEventStore()

  // Subscribe to zap receipts (kind 9735) for this event
  const zaps = useObservableMemo(() => {
    const filter = {
      kinds: [9735],
      '#e': [eventId],
    }

    return eventStore.timeline(filter)
  }, [eventStore, eventId])

  // Calculate total sats from zap receipts
  const { totalSats, zapCount } = useMemo(() => {
    if (!zaps || zaps.length === 0) {
      return { totalSats: 0, zapCount: 0 }
    }

    let total = 0
    const seenPayments = new Set<string>()

    for (const zap of zaps) {
      // Get bolt11 from tags
      const bolt11Tag = zap.tags.find(t => t[0] === 'bolt11')
      const bolt11 = bolt11Tag?.[1]

      if (bolt11 && !seenPayments.has(bolt11)) {
        seenPayments.add(bolt11)
        try {
          const amount = getInvoiceAmount(bolt11)
          total += amount
        } catch {
          // Invalid bolt11, skip
        }
      }
    }

    return { totalSats: total, zapCount: seenPayments.size }
  }, [zaps])

  // Note: authorPubkey is included for potential future filtering
  // but may not be used in the initial implementation
  void authorPubkey

  return {
    totalSats,
    zapCount,
    zaps: zaps || [],
    isLoading: !zaps,
  }
}

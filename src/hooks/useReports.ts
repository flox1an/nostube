import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useMemo } from 'react'
import type { Filter } from 'nostr-tools'

export interface ProcessedReportEvent {
  justification: string
  pubkey?: string
  pubkeyReason?: string
  eventId?: string
  eventReason?: string
  hash?: string
  hashReason?: string
}

interface UseReportsParams {
  p?: string // pubkey
  e?: string // eventId
  x?: string // blob hash
}

export const useReports = ({ p, e, x }: UseReportsParams = {}) => {
  const eventStore = useEventStore()

  // Build filter for reports (kind 1984)
  const filter = useMemo(() => {
    const baseFilter: Filter = {
      kinds: [1984],
    }

    if (p) {
      baseFilter['#p'] = [p]
    }
    if (e) {
      baseFilter['#e'] = [e]
    }
    if (x) {
      baseFilter['#x'] = [x]
    }

    return baseFilter
  }, [p, e, x])

  // Use EventStore timeline to get reports
  const reportEvents = use$(() => eventStore.timeline([filter]), [eventStore, filter]) ?? []

  const processedReports = useMemo(() => {
    return reportEvents.map(event => {
      const processed: ProcessedReportEvent = {
        justification: event.content,
      }

      const pTag = event.tags.find(tag => tag[0] === 'p' && tag[1])
      if (pTag) {
        processed.pubkey = pTag[1]
        processed.pubkeyReason = pTag[2]
      }

      const eTag = event.tags.find(tag => tag[0] === 'e' && tag[1])
      if (eTag) {
        processed.eventId = eTag[1]
        processed.eventReason = eTag[2]
      }

      const xTag = event.tags.find(tag => tag[0] === 'x' && tag[1])
      if (xTag) {
        processed.hash = xTag[1]
        processed.hashReason = xTag[2]
      }

      return processed
    })
  }, [reportEvents])

  return {
    data: processedReports,
    isLoading: reportEvents.length === 0,
  }
}

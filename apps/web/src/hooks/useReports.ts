import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useMemo } from 'react'
import type { ProcessedReportEvent } from '@nostube/core/reports'

export type { ProcessedReportEvent }

/**
 * Reports (kind 1984) by one author, read from the local event store. Only the
 * author's own reports may act on what the app shows: a stranger's report must
 * never hide or block anything. Without an author there are no reports.
 */
export const useReports = (author: string | undefined) => {
  const eventStore = useEventStore()

  const rawReportEvents = use$(
    () => (author ? eventStore.timeline([{ kinds: [1984], authors: [author] }]) : undefined),
    [eventStore, author]
  )
  const reportEvents = useMemo(() => rawReportEvents ?? [], [rawReportEvents])

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

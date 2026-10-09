/** A report event (kind 1984) reduced to the fields the app acts on. */
export interface ProcessedReportEvent {
  justification: string
  pubkey?: string
  pubkeyReason?: string
  eventId?: string
  eventReason?: string
  hash?: string
  hashReason?: string
}

export type ReportedPubkeys = Record<string, ProcessedReportEvent | boolean>

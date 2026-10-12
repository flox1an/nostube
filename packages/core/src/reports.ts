/** The reasons the report dialogs offer: NIP-56's own types plus `harassment`, which apps/web already sent before this type existed. */
export type ReportReason =
  'spam' | 'nudity' | 'profanity' | 'illegal' | 'impersonation' | 'harassment' | 'other'

/** What a report event (kind 1984) is about: a video, a comment, or an account on its own. */
export interface ReportTarget {
  type: 'video' | 'comment' | 'profile'
  /** The reported video's or comment's event id, or the reported pubkey for a profile report. */
  id: string
  /** The content's author; irrelevant and ignored for a profile report. */
  author?: string
}

/**
 * NIP-56 tags for a report: a profile report carries only a `p` tag, a content report tags the
 * event and (when known) its author, both with the reason as the tag's third element. Matches
 * the one-event-and-its-author resolution rule nostube-server's relay accepts (ADR 0011).
 */
export function buildReportTags(target: ReportTarget, reason: ReportReason): string[][] {
  const tags: string[][] =
    target.type === 'profile' ? [['p', target.id, reason]] : [['e', target.id, reason]]
  if (target.type !== 'profile' && target.author) {
    tags.push(['p', target.author, reason])
  }
  return tags
}

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

import type { NostrEvent } from 'nostr-tools'
import { safeLiveRelay } from './live-stream'
import { validZapReceipts, type ZapEndpoint } from './lnurl-pay'

/** NIP-75 zap goal (kind 9041), sanitized for read-only display. */
export interface ZapGoal {
  event: NostrEvent
  id: string
  /** Who the goal's zaps pay. */
  pubkey: string
  title: string
  summary: string
  image?: string
  targetSats: number
  /** Where the goal's zap receipts are published and tallied (public `wss://` only). */
  relays: string[]
  /** Receipts published after this (unix seconds) no longer count. */
  closedAt?: number
}

export const ZAP_GOAL_KIND = 9041
const MAX_RELAYS = 10
const HEX64 = /^[0-9a-f]{64}$/

const tag = (event: NostrEvent, name: string) => event.tags.find(t => t[0] === name)?.[1]

function positiveInt(value: string | undefined): number | undefined {
  const n = Number(value)
  return value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(n) && n > 0
    ? n
    : undefined
}

/** Parses a kind 9041 event; null without a usable id, pubkey or `amount` of at least 1 sat. */
export function parseZapGoal(event: NostrEvent): ZapGoal | null {
  if (event.kind !== ZAP_GOAL_KIND || !HEX64.test(event.id) || !HEX64.test(event.pubkey))
    return null
  const msats = positiveInt(tag(event, 'amount'))
  if (!msats || msats < 1000) return null

  let image: string | undefined
  try {
    const url = new URL(tag(event, 'image') ?? '')
    if (url.protocol === 'https:') image = url.href
  } catch {
    // no usable image
  }

  return {
    event,
    id: event.id,
    pubkey: event.pubkey,
    title: event.content.trim(),
    summary: tag(event, 'summary')?.trim() ?? '',
    image,
    targetSats: Math.floor(msats / 1000),
    relays: [
      ...new Set(
        event.tags
          .filter(t => t[0] === 'relays')
          .flatMap(t => t.slice(1))
          .filter(safeLiveRelay)
      ),
    ].slice(0, MAX_RELAYS),
    closedAt: positiveInt(tag(event, 'closed_at')),
  }
}

export interface ZapGoalProgress {
  raisedSats: number
  /** 0 to 100, for the progress bar. */
  percent: number
  reached: boolean
}

/**
 * Sats raised so far: receipts for the goal event itself, verified per NIP-57 Appendix F against
 * the goal author's LNURL `endpoint`, one per paid invoice, none published after `closed_at`.
 */
export function zapGoalProgress(
  goal: ZapGoal,
  receipts: NostrEvent[],
  endpoint: ZapEndpoint
): ZapGoalProgress {
  const counted = receipts.filter(r => goal.closedAt === undefined || r.created_at <= goal.closedAt)
  const raisedSats = validZapReceipts(counted, {
    endpoint,
    recipient: goal.pubkey,
    eventId: goal.id,
  }).reduce((sum, zap) => sum + zap.sats, 0)
  return {
    raisedSats,
    percent: Math.min(100, (raisedSats / goal.targetSats) * 100),
    reached: raisedSats >= goal.targetSats,
  }
}

/** Open goals first (not past `closed_at`), newest first. */
export function sortZapGoals(goals: ZapGoal[], nowSeconds = Math.floor(Date.now() / 1000)) {
  const open = (g: ZapGoal) => g.closedAt === undefined || g.closedAt > nowSeconds
  return [...goals].sort(
    (a, b) => Number(open(b)) - Number(open(a)) || b.event.created_at - a.event.created_at
  )
}

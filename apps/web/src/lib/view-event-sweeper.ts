import { relayPool } from '@/nostr/core'
import {
  getRetryableEvents,
  deleteById,
  markPublishing,
  markFailed,
  resetPublishingToPending,
} from './view-event-outbox'

export const SWEEPER_INITIAL_DELAY_MS = 2_000
export const SWEEPER_MAX_DELAY_MS = 5 * 60 * 1_000 // 5 min
export const SWEEPER_MAX_RETRIES = 5
const BACKOFF_MULTIPLIER = 2

/** Exponential backoff delay for a given retry count, capped at 5 minutes. */
export function backoffFor(retryCount: number): number {
  return Math.min(
    SWEEPER_INITIAL_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, retryCount),
    SWEEPER_MAX_DELAY_MS
  )
}

/**
 * Flush all pending/failed view events for the given user to the given relays.
 *
 * - Skips rows that haven't passed their backoff window yet.
 * - Drops rows that have exceeded MAX_RETRIES.
 * - Runs sequentially so concurrent sweeps don't double-publish.
 */
export async function flushPendingViewEvents(
  viewerPubkey: string,
  relays: string[]
): Promise<void> {
  if (relays.length === 0) return

  const retryable = await getRetryableEvents(viewerPubkey)

  for (const pending of retryable) {
    // Terminal drop after MAX_RETRIES — row kept until this point for diagnosis.
    if (pending.retryCount >= SWEEPER_MAX_RETRIES) {
      await deleteById(pending.id)
      continue
    }

    // Backoff gate for previously-failed rows.
    if (pending.status === 'failed') {
      const elapsed = Date.now() - pending.updatedAt
      if (elapsed < backoffFor(pending.retryCount)) continue
    }

    await markPublishing(pending.id)

    try {
      await relayPool.publish(relays, pending.event)
      await deleteById(pending.id)
    } catch (error) {
      await markFailed(pending.id, String(error))
    }
  }
}

export { resetPublishingToPending }

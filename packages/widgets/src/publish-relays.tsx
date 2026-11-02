import type { NostrEvent } from 'nostr-tools'
import type { PublishResponse, RelayPool } from 'applesauce-relay'
import {
  beginPublication,
  dismissPublication,
  updatePublication,
  type PublicationTarget,
} from './publication'

/** No relay confirmed the event; `responses` holds every relay's own answer (empty without targets). */
export class PublishRelaysError extends Error {
  readonly responses: PublishResponse[]
  constructor(message: string, responses: PublishResponse[]) {
    super(message)
    this.name = 'PublishRelaysError'
    this.responses = responses
  }
}

type PublishRelaysInput = {
  pool: Pick<RelayPool, 'publish'>
  event: NostrEvent
  relays: readonly string[]
  /** Existing activity (e.g. begun at signing) to move into the publishing phase. */
  activityId?: string
  label?: string
  /** No visible activity; results and errors are still returned honestly. */
  quiet?: boolean
  /** Runs once when the first relay confirms, including a later retry. */
  onConfirmed?: () => void
}

type Job = Pick<PublishRelaysInput, 'pool' | 'event' | 'onConfirmed'> & { id?: string }

/**
 * Publishes one signed event to every relay concurrently and resolves with each relay's answer.
 * Targets settle one by one in the shared publication activity. Rejects with PublishRelaysError
 * when no relay confirmed; the activity then offers a retry of the same event to the failed relays.
 */
export function publishRelays({ activityId, label, quiet, relays, ...job }: PublishRelaysInput) {
  const id = quiet
    ? undefined
    : (activityId ?? beginPublication({ label: label ?? 'Publish', phase: 'publishing' }))
  return send({ ...job, id }, [...new Set(relays)], [])
}

async function send(
  job: Job,
  urls: string[],
  confirmed: PublishResponse[]
): Promise<PublishResponse[]> {
  const { pool, event, id } = job
  // Keyed by the caller's URL; the library may report a normalized `from`.
  const results = new Map<string, PublishResponse>(
    confirmed.map(response => [response.from, response])
  )
  const targets = [...results.keys(), ...urls.filter(url => !results.has(url))]
  const show = (patch: Parameters<typeof updatePublication>[1] = {}) => {
    if (!id) return
    updatePublication(id, {
      phase: 'publishing',
      targets: targets.map((url): PublicationTarget => {
        const response = results.get(url)
        if (!response) return { url, status: 'pending' }
        const status = response.ok
          ? 'confirmed'
          : /timeout/i.test(response.message ?? '')
            ? 'timeout'
            : 'failed'
        return { url, status, message: response.message }
      }),
      ...patch,
    })
  }
  // Upload progress and its cancel belong to the previous phase.
  show({
    status: 'pending',
    error: undefined,
    retry: undefined,
    retryLabel: undefined,
    cancel: undefined,
    completed: undefined,
    total: undefined,
    unit: undefined,
  })
  let notified = confirmed.length > 0

  await Promise.all(
    urls.map(async url => {
      let response: PublishResponse | undefined
      try {
        // Per relay so each target settles on its own; library retries and timeouts apply.
        ;[response] = await pool.publish([url], event)
      } catch (error) {
        response = {
          ok: false,
          from: url,
          message: error instanceof Error ? error.message : String(error),
        }
      }
      // An empty answer: the pool refused to connect (allowlist, ws:// on https) — not attempted.
      results.set(url, {
        ...(response ?? { ok: false, message: 'Relay not allowed by this client' }),
        from: url,
      })
      if (!notified && response?.ok) {
        notified = true
        job.onConfirmed?.()
      }
      show()
    })
  )

  const responses = targets.map(url => results.get(url)!)
  const ok = responses.filter(response => response.ok)
  const failed = responses.filter(response => !response.ok)
  const retry = failed.length
    ? () =>
        send(
          job,
          failed.map(response => response.from),
          ok
        )
    : undefined
  const message = ok.length
    ? undefined
    : responses.length
      ? failed.map(response => `${response.from}: ${response.message ?? 'rejected'}`).join('; ')
      : 'No relays to publish to'
  show({
    status: !ok.length ? 'failed' : failed.length ? 'partial' : 'success',
    error: message,
    retry,
  })
  if (message) throw new PublishRelaysError(message, responses)
  return responses
}

// Drafts no relay confirmed yet, by caller key. Module scope: survives remounts for the page session.
const unconfirmed = new Map<string, { event: NostrEvent; activityId: string; confirmed: boolean }>()

/**
 * Signs (signer wait visible) and publishes a user draft. Publishing the same `key` again after no
 * relay confirmed re-sends the same signed event instead of signing a duplicate; when the status
 * retry already landed it, resolves with that event without publishing again.
 */
export async function signAndPublish({
  key,
  sign,
  pool,
  relays,
  label,
  onConfirmed,
}: {
  key: string
  sign: () => Promise<NostrEvent>
  pool: Pick<RelayPool, 'publish'>
  relays: readonly string[]
  label: string
  onConfirmed?: (event: NostrEvent) => void
}): Promise<NostrEvent> {
  const previous = unconfirmed.get(key)
  if (previous?.confirmed) {
    unconfirmed.delete(key)
    return previous.event
  }
  if (previous) dismissPublication(previous.activityId)
  const activityId = beginPublication({ label, phase: previous ? 'publishing' : 'signing' })
  let event = previous?.event
  if (!event) {
    try {
      event = await sign()
    } catch (error) {
      updatePublication(activityId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
  const entry = { event, activityId, confirmed: false }
  try {
    await publishRelays({
      pool,
      event,
      relays,
      activityId,
      onConfirmed: () => {
        entry.confirmed = true
        onConfirmed?.(entry.event)
      },
    })
  } catch (error) {
    if (error instanceof PublishRelaysError) unconfirmed.set(key, entry)
    throw error
  }
  unconfirmed.delete(key)
  return event
}

import type { NostrEvent } from 'nostr-tools'
import type { NostubeClient } from '@nostube/core/client'
import {
  beginPublication,
  updatePublication,
  type PublicationActivity,
  type PublicationTarget,
} from '@nostube/widgets/publication'
import { publishRelays, PublishRelaysError } from '@nostube/widgets/publish-relays'
import i18n from './i18n'
import {
  loadEventOutbox,
  loadNsite,
  publishNsite,
  retryOutbox,
  type NsiteDelivery,
  type NsiteStatus,
  type OutboxJob,
} from './api'
import { hashFor } from './route'

type Responses = PublishRelaysError['responses']
type Pool = NostubeClient['relayPool']

const key = (url: string) => url.replace(/\/+$/, '')
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Where the server's delivery of one event and its files can be read again after a reload. */
export const deliveryHref = (eventId: string) => `${hashFor('distribution')}?event=${eventId}`

/** The event id a delivery link names, or null. */
export const deliveryEventId = (hash: string) =>
  new URLSearchParams(hash.split('?')[1] ?? '').get('event')

/**
 * A job closed without a copy (canceled) is `done` with a reason: not a confirmation. A pending
 * job the worker no longer runs (its target was removed) will not continue: not pending either.
 */
export const jobStatus = (job: OutboxJob): PublicationTarget['status'] =>
  job.status === 'done'
    ? job.lastError
      ? 'failed'
      : 'confirmed'
    : job.status === 'pending' && !job.active
      ? 'failed'
      : job.status

const RANK = { confirmed: 0, pending: 1, timeout: 2, failed: 3 } as const

/** The server's jobs as one target per relay or Blossom server: its worst job speaks for it. */
export function outboxTargets(jobs: OutboxJob[]): PublicationTarget[] {
  const byTarget = new Map<string, OutboxJob[]>()
  for (const job of jobs)
    byTarget.set(key(job.target), [...(byTarget.get(key(job.target)) ?? []), job])
  return [...byTarget.values()].map(list => {
    const worst = list.reduce((a, b) => (RANK[jobStatus(b)] > RANK[jobStatus(a)] ? b : a))
    const status = jobStatus(worst)
    const confirmed = list.filter(job => jobStatus(job) === 'confirmed').length
    const files =
      list.length > 1 ? i18n.t('publication.files', { done: confirmed, total: list.length }) : ''
    const next = list.flatMap(job =>
      job.status === 'pending' && job.nextAttemptAt ? [job.nextAttemptAt] : []
    )
    return {
      url: worst.target,
      status,
      message:
        [
          files,
          worst.lastError ??
            (worst.status === 'pending' && !worst.active ? i18n.t('publication.inactive') : ''),
        ]
          .filter(Boolean)
          .join(' — ') || undefined,
      nextAttemptAt: status === 'pending' && next.length ? Math.min(...next) : undefined,
    }
  })
}

const overall = (targets: PublicationTarget[]): PublicationActivity['status'] => {
  const bad = targets.some(target => target.status === 'failed' || target.status === 'timeout')
  if (targets.some(target => target.status === 'pending')) return 'pending'
  if (!bad) return 'success'
  return targets.some(target => target.status === 'confirmed') ? 'partial' : 'failed'
}

/**
 * After the browser's own relays answered: follows the server's durable delivery of the event and
 * its files (mirror relays, mirror Blossom servers) in the same activity, polling only while a job
 * the server still runs is pending. Without server jobs the relays' answer stands. Retry is scoped
 * to this event: its failed outbox jobs, and (from this tab) the browser's failed relays the
 * server does not deliver to.
 */
export function trackEventDelivery(
  activity: string,
  event: NostrEvent,
  responses: Responses,
  pool: Pool
) {
  const client = new Map(responses.map(response => [key(response.from), response]))
  let jobs: OutboxJob[] = []
  let tracking = false
  /** The first request for the server's side failed: its error and retry are on the activity. */
  let unknown = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const relayOnly = () => {
    const durable = new Set(jobs.filter(job => job.kind === 'event').map(job => key(job.target)))
    return [...client.values()].filter(response => !durable.has(key(response.from)))
  }
  const show = () => {
    // A relay that confirmed here is confirmed; otherwise the server's durable job speaks for it.
    const only = relayOnly()
    const confirmedHere = new Set(
      [...client.values()].filter(response => response.ok).map(response => key(response.from))
    )
    // Browser relay acknowledgements do not confirm blobs, even if an endpoint has the same URL.
    const serverJobs = jobs.filter(
      job => job.kind !== 'event' || !confirmedHere.has(key(job.target))
    )
    const targets: PublicationTarget[] = [
      ...[...client.values()]
        .filter(response => response.ok || only.includes(response))
        .map((response): PublicationTarget => ({
          url: response.from,
          status: response.ok
            ? 'confirmed'
            : /timeout/i.test(response.message ?? '')
              ? 'timeout'
              : 'failed',
          message: response.message,
        })),
      ...outboxTargets(serverJobs),
    ]
    const status = overall(targets)
    const serverWorks = jobs.some(job => jobStatus(job) === 'pending')
    updatePublication(activity, {
      // Only work the server still runs outlives this tab; a browser-only relay does not.
      phase: serverWorks ? 'background' : 'publishing',
      lifetime: serverWorks ? 'server' : 'browser',
      href: deliveryHref(event.id),
      targets,
      status,
      error: undefined,
      cancel: undefined,
      retryLabel: undefined,
      // Canceled jobs and removed targets are final: retry only what can run again.
      retry:
        jobs.some(job => job.status === 'failed') || only.some(response => !response.ok)
          ? retry
          : undefined,
    })
  }
  const poll = async () => {
    clearTimeout(timer)
    let delay = 10_000
    try {
      jobs = await loadEventOutbox(event.id)
      // No server copies to make: the relays' answer already shown is the whole result.
      if (!tracking && jobs.length === 0) {
        // A diagnostic shown by an earlier failed request is answered now.
        if (unknown) show()
        return
      }
      tracking = true
      show()
      const pending = jobs.filter(job => jobStatus(job) === 'pending')
      if (pending.length === 0) return
      const next = Math.min(...pending.map(job => job.nextAttemptAt ?? 0)) * 1000 - Date.now()
      delay = Math.min(30_000, Math.max(2_000, next + 500))
    } catch (error) {
      // The relays' confirmation stands; say why the server's side is unknown. Before the first
      // answer, asking again is up to the person (no endless polling of a missing endpoint).
      unknown = !tracking
      updatePublication(activity, {
        status: tracking ? 'pending' : 'partial',
        error: message(error),
        href: deliveryHref(event.id),
        retry: poll,
        retryLabel: i18n.t('studio.mirror.refresh'),
      })
      if (!tracking) return
    }
    timer = setTimeout(() => void poll(), delay)
  }
  const retry = async () => {
    const resend = relayOnly()
      .filter(response => !response.ok)
      .map(response => response.from)
    await Promise.all([
      jobs.some(job => job.status === 'failed') && retryOutbox(undefined, event.id),
      resend.length > 0 &&
        publishRelays({ pool, event, relays: resend, quiet: true })
          .catch(error => {
            if (error instanceof PublishRelaysError) return error.responses
            throw error
          })
          .then(answers => {
            for (const answer of answers) client.set(key(answer.from), answer)
          }),
    ])
    await poll()
  }
  void poll()
}

/**
 * Has the server publish the nsite and follows it in a server-lifetime activity until no relay or
 * Blossom server is pending. Retry gives failed targets fresh attempts, or publishes again when
 * the build itself failed.
 */
export async function publishNsiteTracked(label: string, onStatus: (status: NsiteStatus) => void) {
  const activity = beginPublication({
    label,
    phase: 'publishing',
    lifetime: 'server',
    href: hashFor('distribution'),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const poll = async (): Promise<void> => {
    clearTimeout(timer)
    let nsite: NsiteStatus
    try {
      nsite = await loadNsite()
    } catch (error) {
      // The publication itself was queued; only the view of it is stale. Ask again shortly.
      updatePublication(activity, { error: message(error) })
      timer = setTimeout(() => void poll(), 10_000)
      return
    }
    onStatus(nsite)
    const toTarget = (delivery: NsiteDelivery, files = ''): PublicationTarget => ({
      url: delivery.target,
      status: delivery.status === 'done' ? 'confirmed' : delivery.status,
      message: [files, delivery.error].filter(Boolean).join(' — ') || undefined,
    })
    const targets = [
      ...nsite.relays.map(relay => toTarget(relay)),
      ...nsite.servers.map(server =>
        toTarget(
          server,
          server.total > 1
            ? i18n.t('publication.files', { done: server.done, total: server.total })
            : ''
        )
      ),
    ]
    const failed = targets.filter(target => target.status === 'failed')
    const pending =
      nsite.status === 'pending' || targets.some(target => target.status === 'pending')
    const status = nsite.status === 'failed' ? 'failed' : overall(targets)
    updatePublication(activity, {
      targets,
      status: pending && status === 'success' ? 'pending' : status,
      error: nsite.error ?? undefined,
      retry:
        status === 'failed' || status === 'partial'
          ? async () => {
              if (failed.length) await Promise.all(failed.map(target => retryOutbox(target.url)))
              else await publishNsite()
              await poll()
            }
          : undefined,
    })
    if (pending) timer = setTimeout(() => void poll(), 3_000)
  }
  try {
    await publishNsite()
  } catch (error) {
    updatePublication(activity, {
      status: 'failed',
      error: message(error),
      retry: async () => {
        await publishNsite()
        await poll()
      },
    })
    throw error
  }
  await poll()
}

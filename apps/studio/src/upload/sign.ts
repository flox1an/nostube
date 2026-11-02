import { verifyEvent, type EventTemplate } from 'nostr-tools'
import type { NostubeClient } from '@nostube/core/client'
import { beginPublication, updatePublication } from '@nostube/widgets/publication'
import { publishRelays, PublishRelaysError } from '@nostube/widgets/publish-relays'
import { scheduleVideo } from '../api'
import { trackEventDelivery } from '../delivery'
import i18n from '../i18n'
import { hashFor } from '../route'
import type { SignedEvent, Signer } from '../signer'

/** What an earlier phase showed (its bytes, its cancel) no longer applies once signing starts. */
const SETTLED = {
  cancel: undefined,
  completed: undefined,
  total: undefined,
  unit: undefined,
  targets: undefined,
}

/** `signChecked` as the activity's signer wait: nothing can be cancelled from here on. */
export function signFor(
  activity: string,
  signer: Signer,
  template: EventTemplate,
  expectedPubkey: string
) {
  updatePublication(activity, { phase: 'signing', ...SETTLED })
  return signChecked(signer, template, expectedPubkey)
}

/** A Blossom upload's authorization as the activity's signer wait; uploading goes on after it. */
export async function signUploadAuth(
  activity: string,
  signer: Signer,
  template: EventTemplate,
  expectedPubkey: string
) {
  updatePublication(activity, { phase: 'signing' })
  try {
    return await signChecked(signer, template, expectedPubkey)
  } finally {
    updatePublication(activity, { phase: 'uploading' })
  }
}

/** Hands a signed video to the server, which publishes it at its date: server work from here. */
export async function scheduleSigned(activity: string, signed: SignedEvent) {
  updatePublication(activity, { phase: 'publishing', ...SETTLED })
  const scheduled = await scheduleVideo(signed)
  updatePublication(activity, { status: 'success', lifetime: 'server', href: hashFor('videos') })
  return scheduled
}

/**
 * Signs with the connected signer and checks what came back: the key must be the connected one and
 * the signature valid. A signer that answers with something else (or a test stub) fails here, with
 * a message, and not later as a rejection from the server or the relay.
 */
export async function signChecked(
  signer: Signer,
  template: EventTemplate,
  expectedPubkey: string
): Promise<SignedEvent> {
  // A plain copy: nostr-tools remembers an earlier check on the object itself, and what comes
  // from a signer must be checked afresh.
  const signed = JSON.parse(JSON.stringify(await signer.signEvent(template))) as SignedEvent
  if (signed.pubkey !== expectedPubkey) {
    throw new Error(i18n.t('studio.errors.differentKey'))
  }
  if (!verifyEvent(signed)) throw new Error(i18n.t('studio.errors.invalidSignature'))
  return signed
}

/** A publication no relay took: `message` says what to do, `detail` keeps the relays' own words. */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly detail: string
  ) {
    super(message)
  }
}

/**
 * Publishes a signed event as the activity's relay phase and returns the relays that took it.
 * "Sent" is not enough: when no relay says yes, this throws `failure` with the relays' refusals
 * (not a writer, blocked), or advice when none was reached. The activity then follows the
 * server's own delivery of the accepted event.
 */
export async function publishChecked(
  client: NostubeClient,
  relays: string[],
  signed: SignedEvent,
  failure: 'studio.errors.noRelayAccepted' | 'studio.errors.listNotAccepted',
  activity: string
): Promise<string[]> {
  updatePublication(activity, SETTLED)
  let responses
  try {
    responses = await publishRelays({
      pool: client.relayPool,
      event: signed,
      relays,
      activityId: activity,
    })
  } catch (error) {
    if (!(error instanceof PublishRelaysError)) throw error
    const answers = error.responses.map(r => ({
      from: r.from,
      message: r.message || i18n.t('studio.errors.relayRejected'),
      // NIP-01: a relay that refuses says why behind a machine-readable prefix (`blocked: …`);
      // anything else (`Unknown error`, `Timeout`) means the relay was not reached at all.
      refused: !r.message || /^[a-z-]+:/.test(r.message),
    }))
    const refusals = answers.filter(a => a.refused)
    const reasons =
      refusals.length > 0
        ? refusals.map(a => a.message).join('; ')
        : i18n.t(
            answers.length > 0 ? 'studio.errors.relayUnreachable' : 'studio.errors.noRelayAnswered'
          )
    throw new PublishError(
      i18n.t(failure, { reasons }),
      answers.map(a => `${a.from}: ${a.message}`).join('; ')
    )
  }
  trackEventDelivery(activity, signed, responses, client.relayPool)
  return responses.filter(r => r.ok).map(r => r.from)
}

/**
 * One signed change as its own activity: the signer wait, every relay's answer, then the server's
 * delivery. A refusal by every relay offers to send the same signed event again.
 */
export async function signAndPublish(
  client: NostubeClient,
  relays: string[],
  signer: Signer,
  template: EventTemplate,
  pubkey: string,
  failure: 'studio.errors.noRelayAccepted' | 'studio.errors.listNotAccepted',
  label: string
) {
  const activity = beginPublication({ label, phase: 'signing', lifetime: 'browser' })
  let signed: SignedEvent
  try {
    signed = await signChecked(signer, template, pubkey)
  } catch (error) {
    updatePublication(activity, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
  const send = () => publishChecked(client, relays, signed, failure, activity)
  try {
    return { signed, accepted: await send() }
  } catch (error) {
    if (error instanceof PublishError) updatePublication(activity, { retry: send })
    throw error
  }
}

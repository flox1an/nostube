import { verifyEvent, type EventTemplate } from 'nostr-tools'
import type { NostubeClient } from '@nostube/core/client'
import i18n from '../i18n'
import type { SignedEvent, Signer } from '../signer'

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
 * Publishes a signed event and returns the relays that took it. "Sent" is not enough: when no
 * relay says yes, this throws `failure` with the relays' refusals (not a writer, blocked), or
 * advice when none was reached.
 */
export async function publishChecked(
  client: NostubeClient,
  relays: string[],
  signed: SignedEvent,
  failure: 'studio.errors.noRelayAccepted' | 'studio.errors.listNotAccepted'
): Promise<string[]> {
  const responses = await client.relayPool.publish(relays, signed)
  const accepted = responses.filter(r => r.ok).map(r => r.from)
  if (accepted.length === 0) {
    const answers = responses.map(r => ({
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
  return accepted
}

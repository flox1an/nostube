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

/**
 * Publishes a signed event and returns the relays that took it. "Sent" is not enough: when no
 * relay says yes (not a writer, blocked), this throws `failure` with the relays' own reasons.
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
    const why = responses
      .map(r => `${r.from}: ${r.message || i18n.t('studio.errors.relayRejected')}`)
      .join('; ')
    throw new Error(i18n.t(failure, { reasons: why || i18n.t('studio.errors.noRelayAnswered') }))
  }
  return accepted
}

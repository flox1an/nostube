import { verifyEvent, type EventTemplate } from 'nostr-tools'
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

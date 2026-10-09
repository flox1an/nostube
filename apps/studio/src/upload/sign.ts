import { verifyEvent, type EventTemplate } from 'nostr-tools'
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
    throw new Error('The signer signed with a different key than the one connected here.')
  }
  if (!verifyEvent(signed)) throw new Error('The signer returned an invalid signature.')
  return signed
}

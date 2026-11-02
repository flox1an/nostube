import type { EventTemplate } from 'nostr-tools'
import type { InstanceClient } from '../instance-client'
import type { Signer } from '../signer'
import { publishChecked, signFor } from './sign'

/** Only accepted updates reach the local list; the server owns durable blob cleanup. */
export async function publishVideoChange(
  instance: InstanceClient,
  signer: Signer,
  pubkey: string,
  template: EventTemplate,
  activity: string
) {
  const signed = await signFor(activity, signer, template, pubkey)
  const accepted = await publishChecked(
    instance.client,
    instance.config.videoSources,
    signed,
    'studio.errors.noRelayAccepted',
    activity
  )
  instance.client.eventStore.add(signed)
  return { eventId: signed.id, link: '', accepted }
}

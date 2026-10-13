import type { Reach } from '@nostube/core/instance-config'
import type { AdminConfig } from './api'
import { fromDraft, toDraft, type DraftResult } from './draft'

/** Own identity: the owner's NIP-07 key signs. Channel identity: the server's managed key. */
export type Identity = 'own' | 'channel'

/** The wizard shows while the instance has no creator: it cannot publish without one. */
export const needsOnboarding = (config: AdminConfig) => config.creators.length === 0

/**
 * Which identities the wizard offers. Own identity needs a NIP-07 extension; once the server
 * holds a managed key (an earlier Finish whose save failed), it signs everything, so only the
 * channel identity is left.
 */
export function identityChoices({
  extension,
  managedKey,
}: {
  extension: boolean
  managedKey: boolean
}): Identity[] {
  return extension && !managedKey ? ['own', 'channel'] : ['channel']
}

export interface WizardChoices {
  reach: Reach
  title: string
  tagline: string
}

/**
 * The config the wizard saves: `pubkey` becomes the creator and an allowed writer, reach and site
 * texts as chosen, every relay and mirror list as it was. `null` (the channel key does not exist
 * before Finish) checks everything else with the same rules as every other save.
 */
export function wizardConfig(
  base: AdminConfig,
  choices: WizardChoices,
  pubkey: string | null
): DraftResult {
  const writers = pubkey ? [...new Set([...base.allowedWriters, pubkey])] : base.allowedWriters
  return fromDraft({
    ...toDraft(base),
    title: choices.title,
    tagline: choices.tagline,
    reach: choices.reach,
    creatorsText: pubkey ?? '',
    writersText: writers.join('\n'),
  })
}

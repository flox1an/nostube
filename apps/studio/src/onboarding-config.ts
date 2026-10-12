import {
  DEFAULT_BLOSSOM_SERVERS,
  DEFAULT_PROFILE_RELAYS,
  NETWORK_MIRROR_RELAYS,
} from '@nostube/core/instance-config'
import type { AdminConfig } from './api'
import { fromDraft, toDraft, type DraftResult } from './draft'

/** Own identity: the owner's NIP-07 key signs. Channel identity: the server's managed key. */
export type Identity = 'own' | 'channel'
/** Only this instance (local only), or also into the Nostr network (mirrored). */
export type Publishing = 'local' | 'network'

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

/** The editable lists behind a publishing tile, one entry per line. */
export interface PublishingLists {
  profileRelaysText: string
  mirrorRelaysText: string
  /** Only used in channel identity: mirroring blobs needs the managed key (server ADR 0009). */
  mirrorBlossomText: string
}

export function publishingPreset(publishing: Publishing): PublishingLists {
  if (publishing === 'local') {
    return { profileRelaysText: '', mirrorRelaysText: '', mirrorBlossomText: '' }
  }
  return {
    profileRelaysText: DEFAULT_PROFILE_RELAYS.join('\n'),
    mirrorRelaysText: NETWORK_MIRROR_RELAYS.join('\n'),
    mirrorBlossomText: DEFAULT_BLOSSOM_SERVERS.join('\n'),
  }
}

export interface WizardChoices extends PublishingLists {
  identity: Identity
  title: string
  tagline: string
}

/**
 * The config the wizard saves: `pubkey` becomes the creator and an allowed writer, the lists and
 * site texts as chosen. `null` (the channel key does not exist before Finish) checks everything
 * else with the same rules as every other save.
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
    creatorsText: pubkey ?? '',
    writersText: writers.join('\n'),
    profileRelaysText: choices.profileRelaysText,
    mirrorRelaysText: choices.mirrorRelaysText,
    mirrorBlossomText: choices.identity === 'channel' ? choices.mirrorBlossomText : '',
  })
}

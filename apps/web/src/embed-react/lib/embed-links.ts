import { nip19 } from 'nostr-tools'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { buildVideoPath } from '@/utils/video-utils'
import { EMBED_ON_INSTANCE } from './instance'

export interface EmbedLinks {
  /** The page of the video. */
  watchUrl: string
  /** The page of its author. */
  profileUrl: string
  /** The label of the button that sends a viewer to the video. */
  watchLabel: string
  /** What a viewer reads when a sensitive video does not play inside the embed. */
  sensitiveMessage: string
}

/** `https://x.example/{nip19}` with the identifier filled in. */
const fill = (template: string, id: string) => template.split('{nip19}').join(id)

const ON_THE_SITE = {
  watchLabel: 'Watch on the site',
  sensitiveMessage:
    'This video is marked as sensitive. Open it on the site to confirm that you are 18 or older.',
}

/**
 * Where the embed sends viewers. On nostube that is nostu.be. When a nostube-server instance
 * serves the embed it is part of the creator's website: the creator's videos and the creator open
 * on that site, anything else goes where the creator chose for such links (`site.links`), and
 * nothing in the text names nostube.
 */
export function embedLinks({
  videoId,
  authorPubkey,
  instance = null,
  onInstance = EMBED_ON_INSTANCE,
  origin = location.origin,
}: {
  videoId: string
  authorPubkey: string
  /** The instance's config, when it could be read. */
  instance?: InstanceConfig | null
  /** Whether this embed is served by an instance at all. */
  onInstance?: boolean
  origin?: string
}): EmbedLinks {
  if (!onInstance) {
    return {
      watchUrl: `https://nostu.be${buildVideoPath(videoId, 'video')}`,
      profileUrl: `https://nostu.be${buildProfileUrlFromPubkey(authorPubkey)}`,
      watchLabel: 'Open on nostube',
      sensitiveMessage:
        'This video is marked as sensitive. It only plays for viewers who enabled sensitive content in their nostube settings.',
    }
  }
  // The config is the only way to tell the creator's videos from others; without it the site is
  // the best guess (its video page says "not found" for a video that is not the creator's).
  if (instance && !instance.creators.includes(authorPubkey)) {
    return {
      watchUrl: fill(instance.site.links.video, videoId),
      profileUrl: fill(instance.site.links.profile, nip19.npubEncode(authorPubkey)),
      ...ON_THE_SITE,
      watchLabel: 'Watch the video',
      sensitiveMessage:
        'This video is marked as sensitive. Open it to confirm that you are 18 or older.',
    }
  }
  return { watchUrl: `${origin}/v/${videoId}`, profileUrl: `${origin}/`, ...ON_THE_SITE }
}

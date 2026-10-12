import { nip19 } from 'nostr-tools'
import { fillLinkTemplate, type InstanceConfig } from '@nostube/core/instance-config'
import { withRelays } from '@nostube/core/nip19'
import type { RichTextLinks } from '@nostube/widgets/components/RichTextContent'
import { tagPath } from './video-path'

const VIDEO_KINDS = new Set([21, 22, 34235, 34236])

/**
 * Where the links in a video description go. The creator's own videos, the creator and tags open
 * on the site itself, a timestamp seeks in the player, and everything else goes
 * out to the viewer the creator picked in the studio (`site.links`).
 */
export function siteLinks(config: InstanceConfig): RichTextLinks {
  const creators = new Set(config.creators)
  const { links } = config.site
  // The relays that hold this instance's events (the channel profile, the videos); with no public
  // mirrors they are the only place to read them from, so every outgoing entity names them.
  const instanceRelays = [...new Set([...config.interactionRelays, ...config.videoSources])]
  return {
    // nprofile, not npub: the hints let the receiver fetch the profile from the instance relay.
    profile: ({ pubkey, relays }) =>
      creators.has(pubkey)
        ? { to: '/' }
        : {
            href: fillLinkTemplate(
              links.profile,
              nip19.nprofileEncode({
                pubkey,
                relays: [...new Set([...relays, ...instanceRelays])],
              })
            ),
          },
    hashtag: tag => ({ to: tagPath(tag) }),
    timestamp: (videoLink, seconds) => ({
      to: `/v/${withRelays(videoLink, instanceRelays)}?t=${Math.floor(seconds)}`,
    }),
    event: reference => {
      const isVideo = reference.kind !== undefined && VIDEO_KINDS.has(reference.kind)
      if (isVideo && reference.pubkey && creators.has(reference.pubkey)) {
        return { to: `/v/${withRelays(reference.nip19, instanceRelays)}` }
      }
      return {
        href: fillLinkTemplate(
          isVideo ? links.video : links.note,
          withRelays(reference.nip19, instanceRelays)
        ),
      }
    },
  }
}

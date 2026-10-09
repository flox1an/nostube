import { nip19 } from 'nostr-tools'
import { fillLinkTemplate, type InstanceConfig } from '@nostube/core/instance-config'
import type { RichTextLinks } from '@nostube/widgets/components/RichTextContent'

const VIDEO_KINDS = new Set([21, 22, 34235, 34236])

/**
 * Where the links in a video description go. The creator's own videos and the creator open on
 * the site itself, tags have no page, a timestamp seeks in the player, and everything else goes
 * out to the viewer the creator picked in the studio (`site.links`).
 */
export function siteLinks(config: InstanceConfig): RichTextLinks {
  const creators = new Set(config.creators)
  const { links } = config.site
  return {
    // npub, not nprofile: the relays this site knows are the instance's, not for a public link.
    profile: ({ pubkey }) =>
      creators.has(pubkey)
        ? { to: '/' }
        : { href: fillLinkTemplate(links.profile, nip19.npubEncode(pubkey)) },
    hashtag: () => null,
    timestamp: (videoLink, seconds) => ({ to: `/v/${videoLink}?t=${Math.floor(seconds)}` }),
    event: reference => {
      const isVideo = reference.kind !== undefined && VIDEO_KINDS.has(reference.kind)
      if (isVideo && reference.pubkey && creators.has(reference.pubkey)) {
        return { to: `/v/${reference.nip19}` }
      }
      return { href: fillLinkTemplate(isVideo ? links.video : links.note, reference.nip19) }
    },
  }
}
